"""SSCI Phase 1 backend tests - public routes, auth, RBAC, CRUD, lead flow."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
ADMIN_EMAIL = "admin@ssci.local"
ADMIN_PASSWORD = "63f12XvsQoBGkpDjTdZQqg"

QA_LEAD_IDS = []
QA_STUDENT_IDS = []


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- Public routes ----------------
@pytest.mark.parametrize("path", [
    "/api/courses", "/api/batches", "/api/trainers", "/api/blog",
    "/api/floating-skills", "/api/website/hero", "/api/website/settings",
    "/api/announcement",
])
def test_public_routes_reachable(session, path):
    r = session.get(f"{BASE_URL}{path}")
    assert r.status_code == 200, f"{path} -> {r.status_code}"
    data = r.json()
    assert data.get("success") is True, data


# ---------------- Lead creation / validation ----------------
def test_lead_create_success(session):
    payload = {
        "name": "QA TEST - DELETE ME",
        "phone": "+91 9000000010",
        "email": "qa-test-delete@ssci.invalid",
        "courseInterested": "MS Office & Computer Fundamentals",
        "source": "Website",
    }
    r = session.post(f"{BASE_URL}/api/leads", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["success"] is True
    lead = data["lead"]
    assert lead["id"].startswith("LEAD-")
    assert lead["status"] == "New"
    assert lead["name"] == payload["name"]
    QA_LEAD_IDS.append(lead["id"])


def test_lead_mass_assignment_protection(session):
    payload = {
        "name": "QA MASS ASSIGN",
        "phone": "9000000011",
        "status": "Converted",
        "id": "LEAD-HACK-999",
        "adminOnlyField": "hacked",
    }
    r = session.post(f"{BASE_URL}/api/leads", json=payload)
    assert r.status_code == 200, r.text
    lead = r.json()["lead"]
    assert lead["status"] == "New", "Server accepted client-supplied status (mass assignment)"
    assert lead["id"] != "LEAD-HACK-999", "Server accepted client-supplied id"
    assert lead["id"].startswith("LEAD-")
    QA_LEAD_IDS.append(lead["id"])


@pytest.mark.parametrize("payload,expected", [
    ({"name": "", "phone": "9000000011"}, 400),
    ({"name": "a", "phone": "9000000011"}, 400),
    ({"name": "QA Valid", "phone": "123"}, 400),
    ({"name": "QA Valid", "phone": "abcdefg"}, 400),
])
def test_lead_validation_rejects(session, payload, expected):
    r = session.post(f"{BASE_URL}/api/leads", json=payload)
    assert r.status_code == expected, f"got {r.status_code}: {r.text}"


# ---------------- Auth ----------------
def test_login_wrong_password(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": "wrong-password-xxx"})
    assert r.status_code == 401
    assert r.json().get("success") is False


def test_auth_me_with_token(session, auth_headers):
    r = session.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert r.json()["user"]["email"] == ADMIN_EMAIL


def test_auth_me_without_token(session):
    r = session.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 401


def test_auth_me_invalid_token(session):
    r = session.get(f"{BASE_URL}/api/auth/me",
                    headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


# ---------------- RBAC ----------------
@pytest.mark.parametrize("path", [
    "/api/leads", "/api/students", "/api/certificates", "/api/audit-logs",
])
def test_protected_get_no_token(session, path):
    r = session.get(f"{BASE_URL}{path}")
    assert r.status_code == 401, f"{path} -> {r.status_code}"


@pytest.mark.parametrize("path", [
    "/api/leads", "/api/students", "/api/certificates", "/api/audit-logs",
])
def test_protected_get_valid_token(session, auth_headers, path):
    r = session.get(f"{BASE_URL}{path}", headers=auth_headers)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"
    assert r.json().get("success") is True


def test_post_courses_requires_auth(session):
    r = session.post(f"{BASE_URL}/api/courses", json={"slug": "x", "title": "x"})
    assert r.status_code == 401


# ---------------- Courses CRUD ----------------
def test_courses_crud(session, auth_headers):
    slug = "qa-test-delete-me"
    payload = {
        "slug": slug,
        "title": "QA Test Course - Delete Me",
        "categoryId": "qa",
        "categoryName": "QA",
        "level": "Beginner",
        "duration": "1 Day",
        "mode": "Online",
        "shortDescription": "qa",
        "fullDescription": "qa test course",
    }
    r = session.post(f"{BASE_URL}/api/courses", json=payload, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True

    r = session.get(f"{BASE_URL}/api/courses/{slug}")
    assert r.status_code == 200
    assert r.json()["course"]["slug"] == slug

    r = session.delete(f"{BASE_URL}/api/courses/{slug}", headers=auth_headers)
    assert r.status_code == 200

    r = session.get(f"{BASE_URL}/api/courses/{slug}")
    assert r.status_code == 404


# ---------------- Batches CRUD ----------------
def test_batches_crud(session, auth_headers):
    courses = session.get(f"{BASE_URL}/api/courses").json()["courses"]
    assert courses, "need at least one course"
    course_title = courses[0]["title"]
    batch_id = "QA-BATCH-DELETE-ME"
    payload = {
        "id": batch_id,
        "course": course_title,
        "startDate": "2026-02-01",
        "endDate": "2026-03-01",
        "timing": "Morning",
        "timeRange": "10am-12pm",
        "mode": "Online",
        "status": "Open",
    }
    r = session.post(f"{BASE_URL}/api/batches", json=payload, headers=auth_headers)
    assert r.status_code == 200, r.text

    r = session.get(f"{BASE_URL}/api/batches")
    ids = [b.get("id") for b in r.json()["batches"]]
    assert batch_id in ids

    r = session.delete(f"{BASE_URL}/api/batches/{batch_id}", headers=auth_headers)
    assert r.status_code == 200

    r = session.get(f"{BASE_URL}/api/batches")
    ids = [b.get("id") for b in r.json()["batches"]]
    assert batch_id not in ids


# ---------------- Lead -> Student conversion ----------------
def test_lead_conversion_flow(session, auth_headers):
    r = session.post(f"{BASE_URL}/api/leads", json={
        "name": "QA Convert User",
        "phone": "9000000020",
        "email": "qa-convert@ssci.invalid",
        "courseInterested": "QA Course",
        "source": "Website",
    })
    lead_id = r.json()["lead"]["id"]
    QA_LEAD_IDS.append(lead_id)

    r = session.post(f"{BASE_URL}/api/leads/{lead_id}/convert", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    student = body["student"]
    assert student["studentId"].startswith("SSCI-STD-")
    assert body["lead"]["status"] == "Converted"
    QA_STUDENT_IDS.append(student["id"])

    # second convert -> 409
    r2 = session.post(f"{BASE_URL}/api/leads/{lead_id}/convert", headers=auth_headers)
    assert r2.status_code == 409, r2.text
    assert "already" in r2.json()["message"].lower()

    # student retrievable
    r3 = session.get(f"{BASE_URL}/api/students", headers=auth_headers)
    student_ids = [s.get("studentId") for s in r3.json()["students"]]
    assert student["studentId"] in student_ids


# ---------------- Secret hygiene ----------------
def test_error_bodies_no_stack(session):
    r = session.get(f"{BASE_URL}/api/leads")
    assert r.status_code == 401
    body = r.text
    # Must not leak internals
    assert "JWT_SECRET" not in body
    assert "mongoose" not in body.lower()
    assert "at Object." not in body  # stack trace


# ---------------- CORS ----------------
def test_cors_preflight_login(session):
    r = session.options(
        f"{BASE_URL}/api/auth/login",
        headers={
            "Origin": "https://31c377ec-6c57-4dee-b433-c33bf89f3600.preview.emergentagent.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code in (200, 204), r.status_code
    assert "access-control-allow-origin" in {k.lower() for k in r.headers.keys()}


# ---------------- Cleanup ----------------
def test_zz_cleanup(session, auth_headers):
    # Delete all QA leads created
    r = session.get(f"{BASE_URL}/api/leads", headers=auth_headers)
    if r.status_code == 200:
        for lead in r.json().get("leads", []):
            name = (lead.get("name") or "")
            if name.startswith("QA") or lead.get("id") in QA_LEAD_IDS:
                # No DELETE /api/leads endpoint - use mongo directly? Just log for now
                pass
    # Delete QA students via DB (no DELETE endpoint); just report
    print(f"QA leads created: {QA_LEAD_IDS}")
    print(f"QA students created: {QA_STUDENT_IDS}")
