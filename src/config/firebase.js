const admin = require("firebase-admin");

let initialized = false;

const initFirebase = () => {
  if (initialized || !process.env.FIREBASE_PROJECT_ID) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });

  initialized = true;
  console.log("Firebase Admin initialized");
};

module.exports = { admin, initFirebase };
