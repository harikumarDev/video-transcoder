const mongoose = require("mongoose");

const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Successfully connected to DB");
  } catch (err) {
    console.log("Error connecting to DB");
    console.error(err);
    process.exit(1);
  }
};

const disconnect = async () => {
  try {
    await mongoose.disconnect();
    console.log("Disconnected the DB");
  } catch (err) {
    console.log("Error disconnecting the DB");
    console.error(err);
    process.exit(1);
  }
};

module.exports = {
  connect,
  disconnect,
};
