
const jwt = require("jsonwebtoken");

// CHECK LOGIN TOKEN
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Please login first."
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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
