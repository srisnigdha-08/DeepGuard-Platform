const { verifyAccessToken } = require("../config/jwt");
const User = require("../models/User");

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res
        .status(401)
        .json({
          success: false,
          message: "No token provided.",
          code: "NO_TOKEN",
        });

    const token = header.split(" ")[1];
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (e) {
      return res.status(401).json({
        success: false,
        message:
          e.name === "TokenExpiredError" ? "Token expired." : "Invalid token.",
        code:
          e.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      });
    }

    const user = await User.findById(decoded.userId)
      .select("-password -refreshTokens")
      .lean();
    if (!user)
      return res
        .status(401)
        .json({
          success: false,
          message: "User not found.",
          code: "USER_NOT_FOUND",
        });
    if (!user.isActive)
      return res
        .status(403)
        .json({
          success: false,
          message: "Account suspended.",
          code: "SUSPENDED",
        });

    req.user = {
      ...user,
      id: user._id.toString(),
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate };
