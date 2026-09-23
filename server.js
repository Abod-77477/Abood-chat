const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // دعم رفع وسائط وملفات حتى 100 ميجابايت
});

app.use(express.static(path.join(__dirname)));

// قواعد البيانات بذاكرة الخادم
const users = {}; 
const conversations = {}; 
const channels = {};
const statuses = []; 

// محادثة جماعية وقناة افتراضية للاختبار
conversations['101'] = { id: '101', title: 'المحادثة الجماعية (101)', isGroup: true, messages: [] };
channels['chan_1'] = { id: 'chan_1', title: 'قناة الأخبار الرسمية 📢', subscribers: 1, messages: [] };

io.on('connection', (socket) => {

  // 1. تسجيل المستخدم والبدء
  socket.on('register_user', (userData) => {
    users[userData.id] = {
      ...users[userData.id],
      ...userData,
      socketId: socket.id
    };
    socket.userId = userData.id;
    socket.emit('user_registered', users[userData.id]);
  });

  // 2. إنشاء مجموعة
  socket.on('create_group', (data) => {
    const groupId = 'group_' + Math.floor(10000000 + Math.random() * 90000000);
    conversations[groupId] = {
      id: groupId,
      title: data.title,
      isGroup: true,
      messages: []
    };
    socket.emit('group_created', conversations[groupId]);
  });

  // 3. إنشاء قناة جديدة
  socket.on('create_channel', (data) => {
    const channelId = 'chan_' + Math.floor(10000000 + Math.random() * 90000000);
    channels[channelId] = {
      id: channelId,
      title: data.title,
      description: data.description || '',
      subscribers: 1,
      messages: []
    };
    io.emit('channel_created', channels[channelId]);
  });

  // 4. الانضمام للمحادثات والقنوات
  socket.on('join_conversation', (convId) => {
    socket.join(convId);
    let history = [];
    if (conversations[convId]) history = conversations[convId].messages;
    else if (channels[convId]) history = channels[convId].messages;
    else {
      conversations[convId] = { id: convId, title: 'محادثة خاصة', isGroup: false, messages: [] };
    }
    socket.emit('load_history', history);
  });

  // 5. إرسال الوسائط والرسائل (نص، صورة، فيديو، صوت، مستند)
  socket.on('send_message', (msg) => {
    const fullMsg = {
      ...msg,
      id: 'msg_' + Date.now(),
      createdAt: new Date().toISOString()
    };

    if (conversations[msg.conversationId]) {
      conversations[msg.conversationId].messages.push(fullMsg);
    } else if (channels[msg.conversationId]) {
      channels[msg.conversationId].messages.push(fullMsg);
    }

    io.to(msg.conversationId).emit('receive_message', fullMsg);
  });

  // 6. نشر الحالات والاستوريات من وسائط الملفات
  socket.on('post_status', (statusData) => {
    const newStatus = {
      id: 'status_' + Date.now(),
      userId: statusData.userId,
      userName: statusData.userName,
      type: statusData.type, // 'text', 'image', 'video'
      content: statusData.content,
      createdAt: new Date().toISOString()
    };
    statuses.unshift(newStatus);
    io.emit('new_status', newStatus);
  });

  socket.on('get_statuses', () => {
    socket.emit('load_statuses', statuses);
  });

  socket.on('get_channels', () => {
    socket.emit('load_channels', Object.values(channels));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 السيرفر يعمل على http://localhost:${PORT}`));

