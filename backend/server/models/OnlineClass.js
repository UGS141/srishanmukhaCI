import mongoose from 'mongoose';

const topicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    duration: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const moduleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    summary: { type: String, trim: true, default: '' },
    topics: { type: [topicSchema], default: [] },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    meetingUrl: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['Scheduled', 'Live', 'Completed', 'Cancelled'],
      default: 'Scheduled',
    },
  },
  { _id: false }
);

const onlineClassSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    courseSlug: { type: String, trim: true, default: '' },
    courseName: { type: String, trim: true, default: '' },
    batchId: { type: String, trim: true, default: '' },
    trainerName: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
    defaultMeetingUrl: { type: String, trim: true, default: '' },
    enrolledStudentIds: { type: [String], default: [] },
    modules: { type: [moduleSchema], default: [] },
    sessions: { type: [sessionSchema], default: [] },
    status: {
      type: String,
      enum: ['Draft', 'Active', 'Completed', 'Archived'],
      default: 'Draft',
      index: true,
    },
  },
  { timestamps: true }
);

export const OnlineClass = mongoose.model('OnlineClass', onlineClassSchema);
