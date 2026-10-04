"""SSCI Phase 2 backend tests - Dashboard analytics, Online Classes CRUD + RBAC, Exports."""
import os
import io
import time
import re
import pytest
import requests
import bcrypt
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "ssci_dev"

ADMIN_EMAIL = "admin@ssci.local"
ADMIN_PASSWORD = "63f12XvsQoBGkpDjTdZQqg"

TEST_USERS = {
    "VIEWER": {"email": "qa-viewer@ssci.invalid", "password": "QaViewerPass123!", "name": "QA Viewer"},
    "TRAINER": {"email": "qa-trainer@ssci.invalid", "password": "QaTrainerPass123!", "name": "QA Trainer"},
    "CONTENT MANAGER": {"email": "qa-content@ssci.invalid", "password": "QaContentPass123!", "name": "QA Content"},
    "COUNSELLOR": {"email": "qa-counsellor@ssci.invalid", "password": "QaCounsellorPass123!", "name": "QA Counsellor"},
}

QA_LEAD_IDS = []
QA_SLUGS = []


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session", autouse=True)
def seed_role_users(mongo):
    """Insert test role users with bcrypt-hashed passwords directly."""
    coll = mongo["adminusers"]
    for role, u in TEST_USERS.items():
        hashed = bcrypt.hashpw(u["password"].encode(), bcrypt.gensalt(rounds=10)).decode()
        coll.update_one(
            {"email": u["email"]},
            {"$set": {
                "name": u["name"], "email": u["email"], "password": hashed,
                "role": role, "status": "ACTIVE", "sessionVersion": 0,
                "permissions": [], "updatedAt": time.time(),
            },
             "$setOnInsert": {"createdAt": time.time()}},
            upsert=True,
        )
    yield
    coll.delete_many({"email": {"$in": [u["email"] for u in TEST_USERS.values()]}})


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token(s):
    return _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def role_tokens(s, seed_role_users):
    out = {}
    for role, u in TEST_USERS.items():
        out[role] = _login(s, u["email"], u["password"])
    return out


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Dashboard analytics ----------------
class TestDashboardAnalytics:
    def test_no_token_401(self, s):
        r = s.get(f"{BASE_URL}/api/dashboard/analytics")
        assert r.status_code == 401

    def test_invalid_token_401(self, s):
        r = s.get(f"{BASE_URL}/api/dashboard/analytics", headers={"Authorization": "Bearer bogus"})
        assert r.status_code == 401

    def test_super_admin_payload_shape(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/dashboard/analytics", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is True
        assert "generatedAt" in d
        for key in ("totalLeads", "newLeads7d", "newLeadsToday", "convertedLeads",
                    "totalStudents", "totalCourses", "totalBatches", "totalCertificates"):
            assert key in d["counts"], f"missing counts.{key}"
            assert isinstance(d["counts"][key], int)
        assert isinstance(d["conversionRate"], (int, float))
        for k in ("today", "overdue", "upcoming", "total"):
            assert k in d["followUps"]
        assert isinstance(d["leadsByStatus"], list)
        assert isinstance(d["leadsBySource"], list)
        assert isinstance(d["topCourseInterest"], list)
        assert isinstance(d["dailyTrend"], list) and len(d["dailyTrend"]) == 30
        for row in d["dailyTrend"]:
            assert "date" in row and "count" in row

    def test_viewer_allowed(self, s, role_tokens):
        r = s.get(f"{BASE_URL}/api/dashboard/analytics", headers=_hdr(role_tokens["VIEWER"]))
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True

    def test_trainer_forbidden(self, s, role_tokens):
        r = s.get(f"{BASE_URL}/api/dashboard/analytics", headers=_hdr(role_tokens["TRAINER"]))
        assert r.status_code == 403, r.text

    def test_aggregation_accuracy(self, s, admin_headers):
        # Pre-count
        pre = s.get(f"{BASE_URL}/api/dashboard/analytics", headers=admin_headers).json()
        pre_total = pre["counts"]["totalLeads"]
        pre_conv = pre["counts"]["convertedLeads"]

        # Create 3 QA leads
        payloads = [
            {"name": "QA Dash1", "phone": "9000001001", "courseInterested": "QA-Course-Alpha", "source": "Website"},
            {"name": "QA Dash2", "phone": "9000001002", "courseInterested": "QA-Course-Alpha", "source": "Website"},
            {"name": "QA Dash3", "phone": "9000001003", "courseInterested": "QA-Course-Beta", "source": "Website"},
        ]
        ids = []
        for p in payloads:
            r = s.post(f"{BASE_URL}/api/leads", json=p)
            assert r.status_code == 200, r.text
            ids.append(r.json()["lead"]["id"])
            QA_LEAD_IDS.append(r.json()["lead"]["id"])
        # Convert one via admin
        rc = s.post(f"{BASE_URL}/api/leads/{ids[0]}/convert", headers=admin_headers)
        assert rc.status_code == 200, rc.text

        post = s.get(f"{BASE_URL}/api/dashboard/analytics", headers=admin_headers).json()
        assert post["counts"]["totalLeads"] == pre_total + 3
        assert post["counts"]["convertedLeads"] == pre_conv + 1
        # Verify conversion rate rounded to 0.1
        expected_rate = round((post["counts"]["convertedLeads"] / post["counts"]["totalLeads"]) * 1000) / 10
        assert abs(post["conversionRate"] - expected_rate) < 0.001
        # topCourseInterest should include at least one of QA courses
        courses = [row["course"] for row in post["topCourseInterest"]]
        assert "QA-Course-Alpha" in courses or "QA-Course-Beta" in courses


# ---------------- Online Classes CRUD + RBAC ----------------
class TestOnlineClasses:
    def test_no_token_401(self, s):
        r = s.get(f"{BASE_URL}/api/online-classes")
        assert r.status_code == 401

    def test_create_as_admin_generates_id_slug(self, s, admin_headers):
        title = "QA Online Python Masters"
        r = s.post(f"{BASE_URL}/api/online-classes", headers=admin_headers, json={
            "title": title,
            "courseSlug": "python-masters",
            "modules": [{"title": "Intro", "topics": [{"title": "Hello"}]}],
            "sessions": [{"title": "S1", "date": "2026-02-01", "startTime": "10:00", "endTime": "12:00", "status": "Scheduled"}],
            # Mass-assignment attempts (id, _id, slug should be ignored; status is allowed)
            "id": "OC-MALICIOUS", "_id": "68badbeef", "slug": "garbage-slug",
        })
        assert r.status_code == 201, r.text
        oc = r.json()["onlineClass"]
        assert oc["id"].startswith("OC-"), oc
        assert oc["id"] != "OC-MALICIOUS"
        assert oc["slug"] == "qa-online-python-masters"
        assert oc["status"] == "Draft"  # default when not provided
        assert len(oc["modules"]) == 1
        assert len(oc["sessions"]) == 1
        QA_SLUGS.append(oc["slug"])

    def test_slug_collision_suffix(self, s, admin_headers):
        title = "QA Collide Class"
        r1 = s.post(f"{BASE_URL}/api/online-classes", headers=admin_headers, json={"title": title})
        assert r1.status_code == 201
        slug1 = r1.json()["onlineClass"]["slug"]
        QA_SLUGS.append(slug1)
        r2 = s.post(f"{BASE_URL}/api/online-classes", headers=admin_headers, json={"title": title})
        assert r2.status_code == 201
        slug2 = r2.json()["onlineClass"]["slug"]
        QA_SLUGS.append(slug2)
        assert slug1 == "qa-collide-class"
        assert re.match(r"^qa-collide-class-\d+$", slug2), slug2

    def test_list_and_search_filter(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/online-classes?search=python", headers=admin_headers)
        assert r.status_code == 200
        titles = [c["title"].lower() for c in r.json()["onlineClasses"]]
        assert any("python" in t for t in titles)

    def test_get_404_missing(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/online-classes/does-not-exist-slug", headers=admin_headers)
        assert r.status_code == 404

    def test_update_persists(self, s, admin_headers):
        if not QA_SLUGS:
            pytest.skip("need a slug")
        slug = QA_SLUGS[0]
        r = s.put(f"{BASE_URL}/api/online-classes/{slug}", headers=admin_headers, json={"status": "Active"})
        assert r.status_code == 200, r.text
        assert r.json()["onlineClass"]["status"] == "Active"
        g = s.get(f"{BASE_URL}/api/online-classes/{slug}", headers=admin_headers).json()
        assert g["onlineClass"]["status"] == "Active"

    def test_rbac_content_manager_can_write(self, s, role_tokens):
        r = s.post(f"{BASE_URL}/api/online-classes", headers=_hdr(role_tokens["CONTENT MANAGER"]),
                   json={"title": "QA CM Written Class"})
        assert r.status_code == 201, r.text
        slug = r.json()["onlineClass"]["slug"]
        QA_SLUGS.append(slug)
        rd = s.delete(f"{BASE_URL}/api/online-classes/{slug}", headers=_hdr(role_tokens["CONTENT MANAGER"]))
        assert rd.status_code == 200

    def test_rbac_counsellor_readonly(self, s, role_tokens):
        hdr = _hdr(role_tokens["COUNSELLOR"])
        r = s.get(f"{BASE_URL}/api/online-classes", headers=hdr)
        assert r.status_code == 200
        rp = s.post(f"{BASE_URL}/api/online-classes", headers=hdr, json={"title": "QA Counsellor Attempt"})
        assert rp.status_code == 403

    def test_delete_removes(self, s, admin_headers):
        # Create a fresh class to delete to avoid ordering issues
        r = s.post(f"{BASE_URL}/api/online-classes", headers=admin_headers,
                   json={"title": "QA Delete Me Later"})
        assert r.status_code == 201
        slug = r.json()["onlineClass"]["slug"]
        QA_SLUGS.append(slug)
        rd = s.delete(f"{BASE_URL}/api/online-classes/{slug}", headers=admin_headers)
        assert rd.status_code == 200
        g = s.get(f"{BASE_URL}/api/online-classes/{slug}", headers=admin_headers)
        assert g.status_code == 404


# ---------------- Exports ----------------
class TestExports:
    def test_csv_enquiries(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/exports/enquiries?format=csv", headers=admin_headers)
        assert r.status_code == 200, r.text[:200]
        assert "text/csv" in r.headers.get("Content-Type", "").lower()
        assert "attachment" in r.headers.get("Content-Disposition", "").lower()
        text = r.text
        # Header row
        assert text.startswith("Lead ID,Name,Phone"), text[:120]

    def test_xlsx_enquiries(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/exports/enquiries?format=xlsx", headers=admin_headers)
        assert r.status_code == 200
        assert "spreadsheetml.sheet" in r.headers.get("Content-Type", "")
        assert r.content[:2] == b"PK", r.content[:4]

    def test_pdf_enquiries(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/exports/enquiries?format=pdf", headers=admin_headers)
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith("application/pdf")
        assert r.content[:5] == b"%PDF-", r.content[:10]

    def test_filtered_csv_only_new(self, s, admin_headers):
        # Create 3 QA Filter leads
        tags = []
        for i, (name, ) in enumerate([("QA FLT NEW A",), ("QA FLT NEW B",), ("QA FLT CONV",)]):
            r = s.post(f"{BASE_URL}/api/leads", json={
                "name": name, "phone": f"900000500{i}", "courseInterested": "QA-FLT",
                "source": "Website",
            })
            assert r.status_code == 200
            tags.append(r.json()["lead"]["id"])
            QA_LEAD_IDS.append(r.json()["lead"]["id"])
        # Convert last one
        s.post(f"{BASE_URL}/api/leads/{tags[-1]}/convert", headers=admin_headers)

        r = s.get(f"{BASE_URL}/api/exports/enquiries?format=csv&status=New", headers=admin_headers)
        assert r.status_code == 200
        body = r.text
        assert "QA FLT NEW A" in body
        assert "QA FLT NEW B" in body
        assert "QA FLT CONV" not in body

    def test_students_batches_all_formats(self, s, admin_headers):
        for ds in ("students", "batches"):
            for fmt, ct in (("csv", "text/csv"), ("xlsx", "spreadsheetml"), ("pdf", "application/pdf")):
                r = s.get(f"{BASE_URL}/api/exports/{ds}?format={fmt}", headers=admin_headers)
                assert r.status_code == 200, f"{ds}/{fmt}: {r.status_code}"
                assert ct in r.headers.get("Content-Type", "")

    def test_students_search_filter(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/exports/students?format=csv&search=zzz-no-match-xyz", headers=admin_headers)
        assert r.status_code == 200
        # Only header row expected
        rows = r.text.strip().splitlines()
        assert len(rows) == 1

    def test_exports_rbac_enquiries_content_mgr_forbidden(self, s, role_tokens):
        r = s.get(f"{BASE_URL}/api/exports/enquiries?format=csv", headers=_hdr(role_tokens["CONTENT MANAGER"]))
        assert r.status_code == 403, r.status_code

    def test_exports_rbac_batches_counsellor_forbidden(self, s, role_tokens):
        r = s.get(f"{BASE_URL}/api/exports/batches?format=csv", headers=_hdr(role_tokens["COUNSELLOR"]))
        assert r.status_code == 403

    def test_unknown_format_400(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/exports/enquiries?format=xml", headers=admin_headers)
        assert r.status_code == 400

    def test_filename_shapes_slugified(self, s, admin_headers):
        """Content-Disposition filename must be ssci-{dataset-slug}-{14digit}.{ext} (no '&')."""
        for ds, label_slug, fmt in [
            ("enquiries", "enquiries-leads", "csv"),
            ("students", "students-roster", "xlsx"),
            ("batches", "batches-schedule", "pdf"),
        ]:
            r = s.get(f"{BASE_URL}/api/exports/{ds}?format={fmt}", headers=admin_headers)
            assert r.status_code == 200, r.text[:200]
            cd = r.headers.get("Content-Disposition", "")
            assert "&" not in cd, f"{ds} filename contains '&': {cd}"
            pattern = rf'attachment; filename="ssci-{label_slug}-\d{{14}}\.{fmt}"'
            assert re.search(pattern, cd), f"{ds}/{fmt} Content-Disposition mismatch: {cd}"


# ---------------- Phase 1 regression smoke ----------------
class TestPhase1Regression:
    def test_login_and_me(self, s, admin_headers):
        r = s.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == ADMIN_EMAIL
        for k in ("id", "name", "email", "role", "permissions"):
            assert k in u, f"missing {k}"
        assert "_id" not in u, "me leaks _id"
        assert "password" not in u, "me leaks password"

    def test_lead_validation_short_name(self, s):
        r = s.post(f"{BASE_URL}/api/leads", json={"name": "a", "phone": "9000000099"})
        assert r.status_code == 400

    def test_lead_validation_bad_phone(self, s):
        r = s.post(f"{BASE_URL}/api/leads", json={"name": "QA Regress", "phone": "abc"})
        assert r.status_code == 400

    def test_duplicate_convert_409(self, s, admin_headers):
        rc = s.post(f"{BASE_URL}/api/leads", json={
            "name": "QA Regress Convert", "phone": "9000000098",
            "courseInterested": "QA", "source": "Website",
        })
        assert rc.status_code == 200
        lid = rc.json()["lead"]["id"]
        QA_LEAD_IDS.append(lid)
        r1 = s.post(f"{BASE_URL}/api/leads/{lid}/convert", headers=admin_headers)
        assert r1.status_code == 200
        r2 = s.post(f"{BASE_URL}/api/leads/{lid}/convert", headers=admin_headers)
        assert r2.status_code == 409


# ---------------- Cleanup ----------------
def test_zzz_cleanup(mongo):
    mongo["leads"].delete_many({"name": {"$regex": "^QA"}})
    mongo["students"].delete_many({"name": {"$regex": "^QA"}})
    mongo["onlineclasses"].delete_many({"title": {"$regex": "^QA"}})
    print("Cleaned QA records.")
