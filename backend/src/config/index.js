module.exports = {
  port: Number(process.env.PORT || 8223),
  mongoUri: process.env.MONGO_URI || 'mongodb://db:27017/echo_island',
  wsPath: process.env.WS_PATH || '/ws',
  jwtSecret: process.env.JWT_SECRET || 'echo-island-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  maxTagsPerPost: 5,
  maxCommentsPerQuery: 50,
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    local: {
      uploadDir: process.env.LOCAL_UPLOAD_DIR || 'uploads',
      publicBaseUrl: process.env.LOCAL_PUBLIC_BASE_URL || 'http://localhost:8223/uploads'
    },
    maxFileSize: {
      image: Number(process.env.MAX_IMAGE_SIZE || 10 * 1024 * 1024),
      audio: Number(process.env.MAX_AUDIO_SIZE || 50 * 1024 * 1024)
    },
    allowedMimeTypes: {
      image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'],
      audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a']
    }
  },
  paymentPlans: {
    monthly: {
      name: '月度频率舱',
      price: 29,
      durationDays: 30,
      features: ['标签皮肤', '数据洞察报告', '私人小组创建权']
    },
    quarterly: {
      name: '季度深海舱',
      price: 79,
      durationDays: 90,
      features: ['标签皮肤', '数据洞察报告', '私人小组创建权', '优先话题曝光']
    },
    yearly: {
      name: '年度星云舱',
      price: 268,
      durationDays: 365,
      features: ['标签皮肤', '数据洞察报告', '私人小组创建权', '优先话题曝光', '线下沙龙优先席位']
    }
  }
};
