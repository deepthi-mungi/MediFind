const express = require("express");
const Notification = require("../models/notification");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken);

// GET USER'S NOTIFICATIONS
router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30);
    return res.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ message: "Unable to load notifications." });
  }
});

// MARK SINGLE NOTIFICATION READ
router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { $set: { isRead: true } },
      { returnDocument: "after" }
    );
    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }
    return res.json(notification);
  } catch (error) {
    console.error("Read notification error:", error);
    return res.status(500).json({ message: "Unable to update notification." });
  }
});

// MARK ALL NOTIFICATIONS READ
router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.json({ message: "All notifications marked as read." });
  } catch (error) {
    console.error("Read all notifications error:", error);
    return res.status(500).json({ message: "Unable to update notifications." });
  }
});

module.exports = router;
