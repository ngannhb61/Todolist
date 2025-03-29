import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { todoAPI } from '../config/api';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Avatar,
  Divider,
} from '@mui/material';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

const Comment = ({ todoId, comments, onCommentAdded }) => {
  const [newComment, setNewComment] = useState('');
  const { user } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const response = await todoAPI.addComment(todoId, {
        content: newComment,
        userId: user.id,
      });
      onCommentAdded(response.data);
      setNewComment('');
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Bình luận ({comments.length})
      </Typography>
      
      <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Viết bình luận..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          sx={{ mb: 1 }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={!newComment.trim()}
          sx={{ float: 'right' }}
        >
          Gửi bình luận
        </Button>
      </Box>

      <Box sx={{ mt: 3 }}>
        {comments.map((comment) => (
          <Paper key={comment.id} sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Avatar sx={{ mr: 1 }}>{comment.user.name[0]}</Avatar>
              <Box>
                <Typography variant="subtitle2">{comment.user.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {format(new Date(comment.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}
                </Typography>
              </Box>
            </Box>
            <Typography variant="body2">{comment.content}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};

export default Comment; 