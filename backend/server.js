const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');
require('dotenv').config();
const authRoutes = require('./routes/authRoutes');
const todoRoutes = require('./routes/todoRoutes');
const userRoutes = require('./routes/userRoutes');
const { authenticateToken } = require('./middleware/auth');

const app = express();

// Cấu hình CORS chi tiết hơn
app.use(cors({
  origin: ['http://localhost:5174', 'http://localhost:5173'], // Thêm port của frontend
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// API đăng nhập
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kiểm tra email và password
    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });
    }

    // Tìm user trong database
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác' });
    }

    // Kiểm tra mật khẩu
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác' });
    }

    // Tạo JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Trả về thông tin user và token
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// API đăng ký
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Kiểm tra thông tin
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });
    }

    // Kiểm tra email đã tồn tại
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Thêm user mới
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    // Tạo JWT token
    const token = jwt.sign(
      { id: result.insertId, email, name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: result.insertId,
        name,
        email
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// API lấy thông tin user hiện tại
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy user' });
    }
    res.json(users[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// API đăng xuất
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  // Trong trường hợp này, chúng ta chỉ cần xóa token ở phía client
  res.json({ message: 'Đăng xuất thành công' });
});

// API todos
app.get('/api/todos', authenticateToken, async (req, res) => {
  try {
    let query;
    let params;

    if (req.user.role === 'admin') {
      // Admin thấy tất cả công việc
      query = `
        SELECT t.*, u.name as assigned_to_name 
        FROM todos t 
        LEFT JOIN task_assignments ta ON t.id = ta.todo_id
        LEFT JOIN users u ON ta.assigned_to = u.id 
        ORDER BY t.created_at DESC
      `;
      params = [];
    } else if (req.user.role === 'manager') {
      // Manager thấy công việc của mình và của nhân viên
      query = `
        SELECT t.*, u.name as assigned_to_name 
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
        SELECT t.*, u.name as assigned_to_name 
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

app.post('/api/todos', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { title, description, dueDate, priority, assignedTo } = req.body;
    
    // Kiểm tra quyền gán công việc
    if (assignedTo && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Không có quyền gán công việc' });
    }

    // Bắt đầu transaction
    await connection.beginTransaction();

    // Tạo todo mới
    const [result] = await connection.query(
      'INSERT INTO todos (title, description, due_date, priority, status) VALUES (?, ?, ?, ?, ?)',
      [title, description, dueDate, priority, 'pending']
    );

    // Nếu có assignedTo và người dùng có quyền (admin hoặc manager), tạo task assignment
    if (assignedTo && (req.user.role === 'admin' || req.user.role === 'manager')) {
      await connection.query(
        'INSERT INTO task_assignments (todo_id, assigned_by, assigned_to) VALUES (?, ?, ?)',
        [result.insertId, req.user.id, assignedTo]
      );
    }

    // Commit transaction
    await connection.commit();

    // Lấy thông tin todo vừa tạo
    const [newTodo] = await connection.query(
      `SELECT t.*, u.name as assigned_to_name 
       FROM todos t 
       LEFT JOIN task_assignments ta ON t.id = ta.todo_id 
       LEFT JOIN users u ON ta.assigned_to = u.id 
       WHERE t.id = ?`,
      [result.insertId]
    );

    res.status(201).json(newTodo[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Create todo error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  } finally {
    connection.release();
  }
});

app.put('/api/todos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log('Received status update:', { id, status });

    // Kiểm tra quyền cập nhật
    const [assignments] = await pool.query(
      'SELECT * FROM task_assignments WHERE todo_id = ? AND (assigned_by = ? OR assigned_to = ?)',
      [id, req.user.id, req.user.id]
    );

    if (assignments.length === 0 && req.user.role !== 'admin') {
      return res.status(404).json({ message: 'Không tìm thấy công việc hoặc không có quyền cập nhật' });
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

app.delete('/api/todos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra quyền xóa
    if (req.user.role !== 'admin') {
      const [assignments] = await pool.query(
        'SELECT * FROM task_assignments WHERE todo_id = ? AND assigned_by = ?',
        [id, req.user.id]
      );

      if (assignments.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy công việc hoặc không có quyền xóa' });
      }
    }

    // Bắt đầu transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Xóa task assignments trước
      await connection.query('DELETE FROM task_assignments WHERE todo_id = ?', [id]);
      // Sau đó xóa todo
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
app.get('/api/todos/:todoId/comments', authenticateToken, async (req, res) => {
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

app.post('/api/todos/:todoId/comments', authenticateToken, async (req, res) => {
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/users', userRoutes);

// API lấy danh sách nhân viên
app.get('/api/users/employees', authenticateToken, async (req, res) => {
  try {
    // Chỉ admin và manager mới có quyền xem danh sách nhân viên
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Không có quyền truy cập' });
    }

    const [employees] = await pool.query(
      'SELECT id, name, email, role, department FROM users WHERE role = ?',
      ['employee']
    );
    res.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 