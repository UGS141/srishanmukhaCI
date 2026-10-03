import mongoose from 'mongoose';

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['SUPER ADMIN', 'ADMIN', 'COUNSELLOR', 'CONTENT MANAGER', 'TRAINER', 'PLACEMENT MANAGER', 'VIEWER'],
      default: 'SUPER ADMIN',
    },
    permissions: [{ type: String }],
    avatar: { type: String },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const AdminUser = mongoose.model('AdminUser', adminUserSchema);
