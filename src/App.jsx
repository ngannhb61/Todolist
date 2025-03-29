import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { todoAPI } from "./config/api";
import Login from "./components/Login";
import Register from "./components/Register";
import Comment from "./components/Comment";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { Delete as DeleteIcon, Edit as EditIcon } from "@mui/icons-material";

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return user ? children : <Navigate to="/login" />;
};

const TodoApp = () => {
  const { user, logout } = useAuth();
  const [todos, setTodos] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [newTodo, setNewTodo] = useState({ 
    title: "", 
    description: "", 
    dueDate: "", 
    priority: "medium",
    assignedTo: "" 
  });
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [comments, setComments] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    loadTodos();
    if (user.role === 'admin' || user.role === 'manager') {
      loadEmployees();
    }
  }, [user.role]);

  useEffect(() => {
    if (selectedTodo) {
      loadComments(selectedTodo.id);
    }
  }, [selectedTodo]);

  const loadTodos = async () => {
    try {
      const response = await todoAPI.getAll();
      setTodos(response.data);
    } catch (error) {
      console.error("Failed to load todos:", error);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await todoAPI.getEmployees();
      setEmployees(response.data);
    } catch (error) {
      console.error("Failed to load employees:", error);
    }
  };

  const loadComments = async (todoId) => {
    try {
      const response = await todoAPI.getComments(todoId);
      setComments(response.data);
    } catch (error) {
      console.error("Failed to load comments:", error);
    }
  };

  const addTodo = async () => {
    if (newTodo.title.trim()) {
      try {
        const todoData = {
          title: newTodo.title,
          description: newTodo.description,
          dueDate: newTodo.dueDate,
          priority: newTodo.priority
        };

        if ((user.role === 'admin' || user.role === 'manager') && newTodo.assignedTo) {
          todoData.assignedTo = newTodo.assignedTo;
        }

        const response = await todoAPI.create(todoData);
        setTodos([...todos, response.data]);
        setNewTodo({ title: "", description: "", dueDate: "", priority: "medium", assignedTo: "" });
      } catch (error) {
        console.error("Failed to add todo:", error);
      }
    }
  };

  const updateTodoStatus = async (id, status) => {
    try {
      console.log('Updating status:', status);
      await todoAPI.update(id, { status });
      setTodos(todos.map(todo => 
        todo.id === id ? { ...todo, status } : todo
      ));
    } catch (error) {
      console.error("Failed to update todo:", error);
    }
  };

  const deleteTodo = async (id) => {
    try {
      await todoAPI.delete(id);
      setTodos(todos.filter(todo => todo.id !== id));
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  };

  const handleCommentAdded = (comment) => {
    setComments([...comments, comment]);
  };

  const filteredTodos = todos.filter(todo => {
    const matchesFilter = filter === "all" || todo.status === filter;
    const matchesSearch = todo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         todo.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Quản Lý Công Việc
          </Typography>
          <Typography variant="subtitle1" sx={{ mr: 2 }}>
            {user.name} ({user.role})
          </Typography>
          <Button color="inherit" onClick={logout}>
            Đăng xuất
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
              <TextField
                label="Tiêu đề công việc"
                value={newTodo.title}
                onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
                sx={{ flex: 1, minWidth: 200 }}
              />
              <TextField
                label="Mô tả"
                value={newTodo.description}
                onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
                sx={{ flex: 1, minWidth: 200 }}
              />
              <TextField
                type="date"
                label="Ngày hết hạn"
                value={newTodo.dueDate}
                onChange={(e) => setNewTodo({ ...newTodo, dueDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <FormControl sx={{ minWidth: 120 }}>
                <InputLabel>Độ ưu tiên</InputLabel>
                <Select
                  value={newTodo.priority}
                  label="Độ ưu tiên"
                  onChange={(e) => setNewTodo({ ...newTodo, priority: e.target.value })}
                >
                  <MenuItem value="low">Thấp</MenuItem>
                  <MenuItem value="medium">Trung bình</MenuItem>
                  <MenuItem value="high">Cao</MenuItem>
                </Select>
              </FormControl>
              {(user.role === 'admin' || user.role === 'manager') && (
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>Gán cho nhân viên</InputLabel>
                  <Select
                    value={newTodo.assignedTo}
                    label="Gán cho nhân viên"
                    onChange={(e) => setNewTodo({ ...newTodo, assignedTo: e.target.value })}
                  >
                    {employees.map(emp => (
                      <MenuItem key={emp.id} value={emp.id}>
                        {emp.name} - {emp.department}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Button
                variant="contained"
                onClick={addTodo}
                disabled={!newTodo.title.trim() || (user.role === 'admin' && !newTodo.assignedTo)}
              >
                Thêm công việc
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Box sx={{ mb: 3, display: "flex", gap: 2 }}>
          <TextField
            label="Tìm kiếm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flex: 1 }}
          />
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Trạng thái</InputLabel>
            <Select
              value={filter}
              label="Trạng thái"
              onChange={(e) => setFilter(e.target.value)}
            >
              <MenuItem value="all">Tất cả</MenuItem>
              <MenuItem value="pending">Đang chờ</MenuItem>
              <MenuItem value="in-progress">Đang thực hiện</MenuItem>
              <MenuItem value="completed">Hoàn thành</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: "grid", gap: 3 }}>
          {filteredTodos.map(todo => (
            <Card key={todo.id}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Box>
                    <Typography variant="h6">{todo.title}</Typography>
                    <Typography color="text.secondary" sx={{ mb: 1 }}>
                      {todo.description}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                      <Typography variant="body2" color="text.secondary">
                        Đến hạn: {todo.dueDate ? format(new Date(todo.dueDate), "dd/MM/yyyy", { locale: vi }) : 'Chưa có hạn'}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          bgcolor: todo.priority === "high" ? "error.light" :
                                  todo.priority === "medium" ? "warning.light" : "success.light",
                          color: todo.priority === "high" ? "error.dark" :
                                 todo.priority === "medium" ? "warning.dark" : "success.dark",
                        }}
                      >
                        {todo.priority === "high" ? "Cao" :
                         todo.priority === "medium" ? "Trung bình" : "Thấp"}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <FormControl size="small">
                      <Select
                        value={todo.status}
                        onChange={(e) => updateTodoStatus(todo.id, e.target.value)}
                        sx={{ minWidth: 120 }}
                      >
                        <MenuItem value="pending">Chờ</MenuItem>
                        <MenuItem value="in-progress">Đang làm</MenuItem>
                        <MenuItem value="completed">Hoàn thành</MenuItem>
                      </Select>
                    </FormControl>
                    <IconButton
                      color="primary"
                      onClick={() => {
                        setSelectedTodo(todo);
                        setOpenDialog(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => deleteTodo(todo.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>

        <Dialog
          open={openDialog}
          onClose={() => setOpenDialog(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            Chi tiết công việc: {selectedTodo?.title}
          </DialogTitle>
          <DialogContent>
            {selectedTodo && (
              <Comment
                todoId={selectedTodo.id}
                comments={comments}
                onCommentAdded={handleCommentAdded}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Đóng</Button>
          </DialogActions>
        </Dialog>
      </Container>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <TodoApp />
              </PrivateRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
};

export default App;
