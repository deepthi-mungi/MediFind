const jwt = require("jsonwebtoken");
const User = require("../models/user");

// CHECK LOGIN TOKEN
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Please login first."
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.id).select("role isActive");

    if (!currentUser) {
      return res.status(401).json({
        message: "Account not found. Please login again."
      });
    }

    if (currentUser.isActive === false) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact the administrator."
      });
    }

    req.user = {
      ...decoded,
      id: currentUser._id.toString(),
      role: currentUser.role
    };
    next();
  } catch (error) {
    return res.status(403).json({
      message: "Invalid or expired token."
    });
  }
}

// CHECK USER ROLE
function authorizeRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You are not authorized."
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRole
};
