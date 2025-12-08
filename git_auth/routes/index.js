const express = require("express");
const router = express.Router();

const indexController = require("../controllers/indexController");

router.get("/", indexController.home);
router.get("/profile", indexController.profile);
router.get("/logout", indexController.logout);

module.exports = router;
