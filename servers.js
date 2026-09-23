const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // دعم رفع وسائط بحد 100 ميجابايت
});

app.use(express.static(path.join(__dirname)));

// --- نظام التخزين الدائم بملف JSON بدون الحاجة لـ SQLite ---
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: {},
      messages: {},
      channels: [
        { id: 'chan_1', title: 'قناة الأخبار الرسمية 📢', description: 'تحديثات وإعلانات التطبيق الرسمية' }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { users: {}, messages: {}, channels: [] };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const dbData = loadDB();
const statuses = [];

// توجيه المتصفح إلى ملف indeex.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'indeex.html'));
});

// --- إدارة اتصالات Socket.io اللحظية ---
io.on('connection', (socket) => {

  // تسجيل / تحديث الحساب
  socket.on('register_user', (userData) => {
    socket.userId = userData.id;
    dbData.users[userData.id] = userData;
    saveDB(dbData);
    socket.emit('user_registered', userData);
  });

  // تحديث بيانات الحساب
  socket.on('update_profile', (userData) => {
    if (dbData.users[userData.id]) {
      dbData.users[userData.id] = { ...dbData.users[userData.id], ...userData };
      saveDB(dbData);
    }
  });

  // البحث عن مستخدم بـ ID أو اليوزر
  socket.on('search_user', (query) => {
    const clean = query.trim().toLowerCase().replace('@', '');
    const results = Object.values(dbData.users).filter(u => 
      (u.id && u.id.toLowerCase().includes(clean)) || 
      (u.username && u.username.toLowerCase().includes(clean))
    );
    socket.emit('search_results', results);
  });

  // إنشاء مجموعة جديدة
  socket.on('create_group', (data) => {
    const groupId = 'group_' + Math.floor(10000000 + Math.random() * 90000000);
    const groupData = { id: groupId, title: data.title, isGroup: true };
    socket.emit('group_created', groupData);
  });

  // إنشاء قناة جديدة
  socket.on('create_channel', (data) => {
    const channelId = 'chan_' + Math.floor(10000000 + Math.random() * 90000000);
    const newChan = { id: channelId, title: data.title, description: data.description || '' };
    dbData.channels.push(newChan);
    saveDB(dbData);
    io.emit('channel_created', newChan);
  });

  // جلب قائمة القنوات
  socket.on('get_channels', () => {
    socket.emit('load_channels', dbData.channels || []);
  });

  // الانضمام لمحادثة/قناة وجلب الأرشيف المحفوظ
  socket.on('join_conversation', (convId) => {
    socket.join(convId);
    const history = dbData.messages[convId] || [];
    socket.emit('load_history', history);
  });

  // إرسال وحفظ الرسائل والوسائط والصوت
  socket.on('send_message', (msg) => {
    const fullMsg = {
      id: Date.now(),
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      content: msg.content,
      type: msg.type,
      fileName: msg.fileName || '',
      createdAt: new Date().toISOString()
    };

    if (!dbData.messages[msg.conversationId]) {
      dbData.messages[msg.conversationId] = [];
    }
    dbData.messages[msg.conversationId].push(fullMsg);
    saveDB(dbData);

    io.to(msg.conversationId).emit('receive_message', fullMsg);
  });

  // نشر واستعراض الحالات/القصص
  socket.on('post_status', (statusData) => {
    const newStatus = {
      id: 'status_' + Date.now(),
      userId: statusData.userId,
      userName: statusData.userName,
      type: statusData.type,
      content: statusData.content,
      createdAt: new Date().toISOString()
    };
    statuses.unshift(newStatus);
    io.emit('new_status', newStatus);
  });

  socket.on('get_statuses', () => {
    socket.emit('load_statuses', statuses);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`📁 تم تفعيل التخزين الدائم بملف JSON بنجاح.`);
  console.log(`🚀 السيرفر يعمل بنجاح ويستجيب عبر ملف (indeex.html) على المنفذ: http://localhost:${PORT}`);
});

