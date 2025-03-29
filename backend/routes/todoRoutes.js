const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Lấy danh sách todos
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query;
    let params;

    if (req.user.role === 'admin') {
      // Admin thấy tất cả công việc
      query = `
        SELECT t.*, u.name as assigned_to_name, ta.assigned_to 
        FROM todos t 
        LEFT JOIN task_assignments ta ON t.id = ta.todo_id
        LEFT JOIN users u ON ta.assigned_to = u.id 
        ORDER BY t.created_at DESC
      `;
      params = [];
    } else if (req.user.role === 'manager') {
      // Manager thấy công việc của mình và của nhân viên
      query = `
        SELECT t.*, u.name as assigned_to_name, ta.assigned_to
        FROM todos t 
        LEFT JOIN task_assignments ta ON t.id = ta.todo_id
        LEFT JOIN users u ON ta.assigned_to = u.id 
        WHERE ta.assigned_by = ? OR ta.assigned_to = ?
        ORDER BY t.created_at DESC
      `;
      params = [req.user.id, req.user.id];
    } else {
      // Nhân viên chỉ thấy công việc được gán cho mình
      query = `
        SELECT t.*, u.name as assigned_to_name, ta.assigned_to
        FROM todos t 
        LEFT JOIN task_assignments ta ON t.id = ta.todo_id
        LEFT JOIN users u ON ta.assigned_to = u.id 
        WHERE ta.assigned_to = ?
        ORDER BY t.created_at DESC
      `;
      params = [req.user.id];
    }

    const [todos] = await pool.query(query, params);
    res.json(todos);
  } catch (error) {
    console.error('Get todos error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Tạo todo mới
router.post('/', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { title, description, dueDate, priority, assignedTo } = req.body;
    
    // Kiểm tra dữ liệu đầu vào
    if (!title) {
      return res.status(400).json({ message: 'Tiêu đề không được để trống' });
    }

    // Bắt đầu transaction
    await connection.beginTransaction();
    
    // Tạo todo mới - chỉ với các cột có trong bảng
    const [todoResult] = await connection.query(
      'INSERT INTO todos (title, description, due_date, priority, status) VALUES (?, ?, ?, ?, ?)',
      [
        title,
        description || null,
        dueDate || null,
        priority || 'medium',
        'pending'
      ]
    );

    // Nếu có assignedTo và người dùng có quyền (admin hoặc manager), tạo task assignment
    if (assignedTo && (req.user.role === 'admin' || req.user.role === 'manager')) {
      await connection.query(
        'INSERT INTO task_assignments (todo_id, assigned_by, assigned_to) VALUES (?, ?, ?)',
        [todoResult.insertId, req.user.id, assignedTo]
      );
    }

    // Commit transaction
    await connection.commit();

    // Lấy thông tin todo vừa tạo
    const [todos] = await connection.query(
      `SELECT t.*, u.name as assigned_to_name 
       FROM todos t 
       LEFT JOIN task_assignments ta ON t.id = ta.todo_id 
       LEFT JOIN users u ON ta.assigned_to = u.id 
       WHERE t.id = ?`,
      [todoResult.insertId]
    );

    res.status(201).json(todos[0]);

  } catch (error) {
    console.error('Error in create todo:', error);
    await connection.rollback();
    res.status(500).json({ 
      message: 'Lỗi khi tạo công việc',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// Cập nhật trạng thái todo
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Kiểm tra quyền cập nhật
    const [assignments] = await pool.query(
      'SELECT * FROM task_assignments WHERE todo_id = ?',
      [id]
    );

    if (assignments.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy công việc' });
    }

    const assignment = assignments[0];
    if (assignment.assigned_to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền cập nhật công việc này' });
    }

    await pool.query(
      'UPDATE todos SET status = ? WHERE id = ?',
      [status, id]
    );

    res.json({ message: 'Cập nhật thành công' });
  } catch (error) {
    console.error('Update todo error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Xóa todo
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra quyền xóa
    const [assignments] = await pool.query(
      'SELECT * FROM task_assignments WHERE todo_id = ?',
      [id]
    );

    if (assignments.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy công việc' });
    }

    const assignment = assignments[0];
    if (assignment.assigned_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền xóa công việc này' });
    }

    // Bắt đầu transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Xóa task assignments
      await connection.query('DELETE FROM task_assignments WHERE todo_id = ?', [id]);
      // Xóa todo
      await connection.query('DELETE FROM todos WHERE id = ?', [id]);

      await connection.commit();
      res.json({ message: 'Xóa thành công' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Delete todo error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// API comments
router.get('/:todoId/comments', authenticateToken, async (req, res) => {
  try {
    const { todoId } = req.params;
    const [comments] = await pool.query(
      `SELECT c.*, u.name as user_name 
       FROM comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.todo_id = ? 
       ORDER BY c.created_at DESC`,
      [todoId]
    );
    res.json(comments);
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

router.post('/:todoId/comments', authenticateToken, async (req, res) => {
  try {
    const { todoId } = req.params;
    const { content } = req.body;
    const [result] = await pool.query(
      'INSERT INTO comments (content, todo_id, user_id) VALUES (?, ?, ?)',
      [content, todoId, req.user.id]
    );
    const [newComment] = await pool.query(
      `SELECT c.*, u.name as user_name 
       FROM comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.id = ?`,
      [result.insertId]
    );
    res.status(201).json(newComment[0]);
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

module.exports = router; 