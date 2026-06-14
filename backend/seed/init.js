const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  User,
  Post,
  Resonance,
  Comment,
  Message,
  RevealDecision,
  PaymentOrder,
  DerivativeProduct,
  BrandCamp,
  DerivativeWaitlist,
  BrandCampInquiry,
  PrivateGroup
} = require('../src/models');
const config = require('../src/config');
const logger = require('../src/utils/logger');

const DEMO_PASSWORD = 'password1';

const DEMO_LOGIN_ACCOUNTS = [
  {
    account: 'fogdao',
    nickname: '雾岛慢声',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=200',
    bio: '在深夜里收集问题，也收集善意。'
  },
  {
    account: 'tide_writer',
    nickname: '潮汐写作者',
    avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=200',
    bio: '喜欢把琐碎生活写成可被引用的句子。'
  },
  {
    account: 'lowfreq_fan',
    nickname: '低频乐器控',
    avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=200',
    bio: '迷恋冷门乐器和慢节奏对谈。'
  },
  {
    account: 'calm_asker',
    nickname: '沉静提问者',
    avatar: 'https://images.pexels.com/photos/1704488/pexels-photo-1704488.jpeg?auto=compress&cs=tinysrgb&w=200',
    bio: '每个问题都值得被耐心打开。'
  }
];

const createDemoUsers = async () => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  return User.create(
    DEMO_LOGIN_ACCOUNTS.map((item) => ({
      openid: `acct:${item.account}`,
      account: item.account,
      passwordHash,
      authProvider: 'password',
      nickname: item.nickname,
      avatar: item.avatar,
      bio: item.bio
    }))
  );
};

const createOriginPosts = async (users) => {
  return Post.create([
    {
      title: '成年后最晚熟的一课',
      contentText:
        '我发现真正的成熟不是“我已经懂了”，而是“我承认自己还会反复犯错”。你们有什么反复绕圈的课题吗？',
      coverImage:
        'https://images.pexels.com/photos/355465/pexels-photo-355465.jpeg?auto=compress&cs=tinysrgb&w=1200',
      dynamicTag: '#深夜哲学家',
      tags: ['成长', '自我觉察', '情绪'],
      author: users[0]._id,
      type: 'origin'
    },
    {
      title: '冷门乐器也能疗愈焦虑吗',
      contentText:
        '今天把巴松和手碟混在一起录了30秒，意外地安抚了我。有没有同好愿意交换你们的“情绪歌单”？',
      coverImage:
        'https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=1200',
      dynamicTag: '#冷门乐器控',
      tags: ['音乐', '疗愈', '创作'],
      contentAudio: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_0a6b6a42f8.mp3?filename=calm-ambient-11016.mp3',
      author: users[2]._id,
      type: 'origin'
    },
    {
      title: '30+之后如何重新交朋友',
      contentText:
        '越长大越不想社交表演，但又想遇见真正同频的人。你如何判断一段关系值得继续投入？',
      coverImage:
        'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=1200',
      dynamicTag: '#慢热社交派',
      tags: ['社交', '关系', '30plus'],
      author: users[1]._id,
      type: 'origin'
    },
    {
      title: '一本书改变你看世界的角度',
      contentText:
        '最近重读《被讨厌的勇气》，发现“课题分离”不是冷漠，而是避免控制。欢迎推荐你们反复重读的书。',
      coverImage:
        'https://images.pexels.com/photos/904616/pexels-photo-904616.jpeg?auto=compress&cs=tinysrgb&w=1200',
      dynamicTag: '#纸页漫游者',
      tags: ['阅读', '心理学', '思辨'],
      contentLink: 'https://www.pexels.com/zh-cn/photo/904616/',
      author: users[3]._id,
      type: 'origin'
    },
    {
      title: '把城市噪音变成灵感素材',
      contentText:
        '地铁报站声、红绿灯提示音、雨夜车流声，拼到一起像一首后摇。你会记录哪些日常声景？',
      coverImage:
        'https://images.pexels.com/photos/302804/pexels-photo-302804.jpeg?auto=compress&cs=tinysrgb&w=1200',
      dynamicTag: '#声景采样师',
      tags: ['城市', '声音', '创意'],
      author: users[1]._id,
      type: 'origin'
    }
  ]);
};

const main = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('Seed connected to MongoDB');

    await Promise.all([
      User.deleteMany({}),
      Post.deleteMany({}),
      Resonance.deleteMany({}),
      Comment.deleteMany({}),
      Message.deleteMany({}),
      RevealDecision.deleteMany({}),
      PaymentOrder.deleteMany({}),
      DerivativeProduct.deleteMany({}),
      BrandCamp.deleteMany({}),
      DerivativeWaitlist.deleteMany({}),
      BrandCampInquiry.deleteMany({}),
      PrivateGroup.deleteMany({})
    ]);

    const users = await createDemoUsers();
    const origins = await createOriginPosts(users);

    const superEchoes = await Post.create([
      {
        title: '合鸣：成熟不是完成态',
        contentText:
          '我补一条：成熟像波浪，不是台阶。关键不是“不再犯错”，而是每次都更快回到诚实。',
        dynamicTag: '#反复练习者',
        tags: ['成长', '复盘', '自我觉察'],
        type: 'super_echo',
        parentPost: origins[0]._id,
        author: users[1]._id
      },
      {
        title: '合鸣：关系中的边界感',
        contentText:
          '判断关系是否值得投入，我会看“冲突后是否还能一起修复”，而不是只看共识。',
        dynamicTag: '#边界研究员',
        tags: ['关系', '社交', '沟通'],
        type: 'super_echo',
        parentPost: origins[2]._id,
        author: users[0]._id
      },
      {
        title: '合鸣：声音作为记忆锚点',
        contentText: '我把城市噪音做成白噪音合集，焦虑时循环播放，有种被现实托住的感觉。',
        dynamicTag: '#现实采样员',
        tags: ['声音', '疗愈', '城市'],
        type: 'super_echo',
        parentPost: origins[4]._id,
        author: users[3]._id
      }
    ]);

    await Promise.all([
      Post.findByIdAndUpdate(origins[0]._id, { $inc: { superEchoCount: 1 } }),
      Post.findByIdAndUpdate(origins[2]._id, { $inc: { superEchoCount: 1 } }),
      Post.findByIdAndUpdate(origins[4]._id, { $inc: { superEchoCount: 1 } })
    ]);

    await Resonance.insertMany([
      { post: origins[0]._id, user: users[1]._id },
      { post: origins[0]._id, user: users[2]._id },
      { post: origins[1]._id, user: users[0]._id },
      { post: origins[1]._id, user: users[1]._id },
      { post: origins[2]._id, user: users[0]._id },
      { post: origins[2]._id, user: users[3]._id },
      { post: origins[3]._id, user: users[0]._id },
      { post: superEchoes[0]._id, user: users[2]._id }
    ]);

    await Comment.insertMany([
      {
        post: origins[0]._id,
        user: users[2]._id,
        dynamicTag: '#清醒旁观者',
        content: '这条让我想到“允许自己摇摆”，也许这才是稳定的起点。'
      },
      {
        post: origins[1]._id,
        user: users[0]._id,
        dynamicTag: '#旋律收集员',
        content: '愿意交换，我最近在做“下班后慢启动歌单”。'
      },
      {
        post: origins[2]._id,
        user: users[3]._id,
        dynamicTag: '#温和提问者',
        content: '冲突后修复这个标准非常有共鸣，我会记下来。'
      },
      {
        post: superEchoes[0]._id,
        user: users[0]._id,
        dynamicTag: '#深夜哲学家',
        content: '你这句“更快回到诚实”太准确了。'
      }
    ]);

    const resonanceStats = await Resonance.aggregate([
      { $group: { _id: '$post', count: { $sum: 1 } } }
    ]);

    const commentStats = await Comment.aggregate([
      { $group: { _id: '$post', count: { $sum: 1 } } }
    ]);

    await Promise.all([
      ...resonanceStats.map((item) => Post.findByIdAndUpdate(item._id, { resonanceCount: item.count })),
      ...commentStats.map((item) => Post.findByIdAndUpdate(item._id, { commentCount: item.count }))
    ]);

    const conversationId = Message.generateConversationId(users[0]._id, users[1]._id);
    await Message.insertMany([
      {
        conversationId,
        sender: users[0]._id,
        receiver: users[1]._id,
        sourcePost: origins[2]._id,
        senderDynamicTag: '#深夜哲学家',
        content: '你的合鸣很有力量，想继续聊聊“修复关系”的方法。',
        read: true
      },
      {
        conversationId,
        sender: users[1]._id,
        receiver: users[0]._id,
        senderDynamicTag: '#边界研究员',
        content: '可以，我最近在练习非暴力沟通。',
        read: true
      },
      {
        conversationId,
        sender: users[0]._id,
        receiver: users[1]._id,
        senderDynamicTag: '#深夜哲学家',
        content: '你通常怎么开场，才不会让对方防御？',
        read: true
      },
      {
        conversationId,
        sender: users[1]._id,
        receiver: users[0]._id,
        senderDynamicTag: '#边界研究员',
        content: '先描述事实，再表达感受，最后提请求。',
        read: false
      },
      {
        conversationId,
        sender: users[0]._id,
        receiver: users[1]._id,
        senderDynamicTag: '#深夜哲学家',
        content: '收到，我今晚就试着用这个框架。',
        read: false
      },
      {
        conversationId,
        sender: users[1]._id,
        receiver: users[0]._id,
        senderDynamicTag: '#边界研究员',
        content: '如果你愿意，我们之后可以交换复盘记录。',
        read: false
      }
    ]);

    await RevealDecision.create({
      conversationId,
      users: [users[0]._id, users[1]._id],
      agreedBy: [users[0]._id],
      revealed: false
    });

    const paidOrder = await PaymentOrder.create({
      orderNo: `EISEED${Date.now()}`,
      user: users[0]._id,
      plan: 'monthly',
      amount: config.paymentPlans.monthly.price,
      status: 'paid',
      paidAt: new Date()
    });

    const expireAt = new Date(Date.now() + config.paymentPlans.monthly.durationDays * 24 * 3600000);
    await User.findByIdAndUpdate(users[0]._id, {
      premium: {
        isActive: true,
        plan: 'monthly',
        expireAt
      },
      tagSkin: 'sunset'
    });

    await User.findByIdAndUpdate(users[1]._id, { tagSkin: 'ink' });
    await User.findByIdAndUpdate(users[2]._id, { tagSkin: 'mint' });

    await User.findByIdAndUpdate(users[0]._id, {
      $addToSet: {
        favoritePosts: {
          $each: [origins[1]._id, origins[3]._id]
        }
      }
    });

    const derivatives = await DerivativeProduct.insertMany([
      {
        type: 'magazine',
        title: '《同频月刊》Vol.09',
        summary: '精选社区高共鸣讨论，围绕关系修复、慢社交与表达边界进行二次编辑。',
        coverImage: 'https://images.pexels.com/photos/590493/pexels-photo-590493.jpeg?auto=compress&cs=tinysrgb&w=1200',
        tags: ['关系', '慢社交', '表达'],
        price: 19
      },
      {
        type: 'audiobook',
        title: '有声特辑：夜航共鸣',
        summary: '由社区作者联合录制的深夜音频，收录12段真实成长叙事与反思。',
        coverImage: 'https://images.pexels.com/photos/3756766/pexels-photo-3756766.jpeg?auto=compress&cs=tinysrgb&w=1200',
        tags: ['声音', '成长', '叙事'],
        price: 29
      },
      {
        type: 'salon',
        title: '线下沙龙：边界与靠近',
        summary: '每月线下同频沙龙，围绕高质量关系构建进行主持式小组讨论。',
        coverImage: 'https://images.pexels.com/photos/3184420/pexels-photo-3184420.jpeg?auto=compress&cs=tinysrgb&w=1200',
        tags: ['线下', '讨论', '关系'],
        price: 88
      }
    ]);

    const camps = await BrandCamp.insertMany([
      {
        organization: '澄海研究社',
        theme: '城市情绪与表达训练营',
        description: '聚焦城市青年情绪表达能力，按月组织主题讨论，品牌仅提供议题支持不介入结论。',
        cycleFee: 6999,
        cycle: 'monthly',
        tags: ['情绪', '表达', '城市']
      },
      {
        organization: '无界读书会',
        theme: '30+深度阅读频率营地',
        description: '面向30+高知群体的长期阅读营地，鼓励观点碰撞与跨领域对话。',
        cycleFee: 16800,
        cycle: 'quarterly',
        tags: ['阅读', '30plus', '思辨']
      }
    ]);

    await DerivativeWaitlist.insertMany([
      { derivative: derivatives[0]._id, user: users[0]._id },
      { derivative: derivatives[1]._id, user: users[1]._id },
      { derivative: derivatives[1]._id, user: users[2]._id },
      { derivative: derivatives[2]._id, user: users[3]._id }
    ]);

    await BrandCampInquiry.insertMany([
      { camp: camps[0]._id, user: users[0]._id },
      { camp: camps[0]._id, user: users[2]._id },
      { camp: camps[1]._id, user: users[1]._id }
    ]);

    await PrivateGroup.create({
      name: '深夜哲学复盘小组',
      theme: '成长与关系修复',
      description: '每周一次匿名复盘，聚焦表达边界与关系修复实践。',
      owner: users[0]._id,
      members: [users[0]._id, users[1]._id]
    });

    logger.info(`Seed completed. users=${users.length}, posts=${origins.length + superEchoes.length}, order=${paidOrder.orderNo}`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error(`Seed failed: ${error.message}`);
    process.exit(1);
  }
};

main();
