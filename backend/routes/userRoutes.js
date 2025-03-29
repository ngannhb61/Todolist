const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const jwt = require('jsonwebtoken');

// Middleware xác thực token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token không hợp lệ' });
    }
    req.user = user;
    next();
  });
};

// API lấy danh sách nhân viên (chỉ dành cho admin và manager)
router.get('/employees', authenticateToken, async (req, res) => {
  try {
    // Kiểm tra role của người dùng
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Không có quyền truy cập' });
    }

    // Lấy danh sách nhân viên (không bao gồm admin và manager)
    const [employees] = await pool.query(
      'SELECT id, name, email, department, role FROM users WHERE role = ?',
      ['employee']
    );

    res.json(employees);
  } catch (error) {
    console.error('Error getting employees:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router; 