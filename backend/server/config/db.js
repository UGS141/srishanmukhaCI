import mongoose from 'mongoose';
import dns from 'dns';

// Global Mongoose plugin: strip Mongo internals from all JSON responses.
// Registered BEFORE any model schema is compiled (db.js is the first local import
// in server/index.js), so every schema inherits this transform.
mongoose.plugin((schema) => {
  const hasBusinessId = schema.path('id');
  schema.set('toJSON', {
    virtuals: Boolean(hasBusinessId) === false ? false : false,
    versionKey: false,
    transform: (_doc, ret) => {
      delete ret._id;
      delete ret.__v;
      if (ret.password) delete ret.password;
      if (ret.sessionVersion !== undefined) delete ret.sessionVersion;
      return ret;
    },
  });
});

export const connectDB = async () => {
  const mongoURI = process.env.MONGO_URL;
  const databaseName = process.env.DB_NAME;

  if (!mongoURI || !databaseName) {
    console.error('\n❌ DATABASE CONNECTION FAILED: MONGO_URL and DB_NAME environment variables are required.\n');
    return false;
  }

  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch (dnsErr) {
    console.warn('⚠️ Custom DNS servers could not be set:', dnsErr.message);
  }

  try {
    const conn = await mongoose.connect(mongoURI, {
      dbName: databaseName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log(`\n✅ DATABASE CONNECTED: Connected to MongoDB Atlas [${conn.connection.name}] at ${conn.connection.host}\n`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('⚠️  MongoDB Connection Error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB connection lost. Reconnecting...');
    });

    return true;
  } catch (error) {
    console.error('\n❌ DATABASE CONNECTION FAILED:', error.message, '\n');
    return false;
  }
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection gracefully closed due to app termination.');
  process.exit(0);
});
