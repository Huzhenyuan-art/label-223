const config = {
  BASE_URL: 'http://localhost:8223',
  WS_URL: 'ws://localhost:8223/ws',
  API: {
    REGISTER: '/api/users/register',
    LOGIN: '/api/users/login',
    ISLAND: '/api/users/me/island',
    INSIGHT_REPORT: '/api/users/me/insight-report',
    FAVORITES_BY_TAG: '/api/users/me/favorites/by-tag',
    FAVORITES_SEARCH: '/api/users/me/favorites/search',
    FAVORITES_BATCH_REMOVE: '/api/users/me/favorites/batch-remove',
    TOGGLE_FAVORITE_PREFIX: '/api/users/me/favorites',
    TAG_SKIN: '/api/users/me/tag-skin',
    USER_PUBLIC_PREFIX: '/api/users/public',

    OCEAN: '/api/feed/ocean',
    HOT_TAGS: '/api/feed/hot-tags',
    DEEP_SEARCH: '/api/feed/search',
    POST_DETAIL_PREFIX: '/api/feed/posts',
    POST_RESONANCES_PREFIX: '/api/feed/posts',

    CREATE_POST: '/api/posts',
    MY_POSTS: '/api/posts/me',
    POST_PREFIX: '/api/posts',
    UPDATE_POST: '/api/posts',
    DELETE_POST: '/api/posts',
    POST_COMMENT_REPLY_PREFIX: '/api/posts',

    CONVERSATIONS: '/api/messages/conversations',
    SEND_MESSAGE: '/api/messages/send',
    REQUEST_REVEAL: '/api/messages/conversations/reveal',
    UNREAD_COUNT: '/api/messages/unread',
    SET_TEMP_NICKNAME: '/api/messages/temp-nickname',

    RESONANCE_NOTIFICATIONS: '/api/users/me/resonance-notifications',
    RESONANCE_NOTIFICATIONS_UNREAD: '/api/users/me/resonance-notifications/unread-count',
    RESONANCE_NOTIFICATIONS_READ: '/api/users/me/resonance-notifications/read',

    PAYMENT_PLANS: '/api/payments/plans',
    CHECKOUT: '/api/payments/checkout',
    MY_ORDERS: '/api/payments/orders/me',

    COMMERCE_DERIVATIVES: '/api/commerce/derivatives',
    DERIVATIVE_WAITLIST_PREFIX: '/api/commerce/derivatives',
    COMMERCE_CAMPS: '/api/commerce/camps',
    CAMP_INQUIRY_PREFIX: '/api/commerce/camps',

    UPLOAD_IMAGE: '/api/upload/image',
    UPLOAD_AUDIO: '/api/upload/audio',
    DELETE_MEDIA: '/api/upload',

    PRIVATE_GROUPS_PREFIX: '/api/private-groups',
    PRIVATE_GROUPS_MY: '/api/private-groups/me',
    PRIVATE_GROUPS_CREATE: '/api/private-groups',
    PRIVATE_GROUPS_JOIN: '/api/private-groups/join',
    PRIVATE_GROUPS_SEARCH_USERS: '/api/private-groups/search-users',

    AUDIT_SENSITIVE_WORDS_INIT: '/api/audit/sensitive-words/init',
    AUDIT_SENSITIVE_WORDS: '/api/audit/sensitive-words',
    AUDIT_SENSITIVE_WORDS_BATCH: '/api/audit/sensitive-words/batch',
    AUDIT_SENSITIVE_WORDS_PREFIX: '/api/audit/sensitive-words',
    AUDIT_LOGS: '/api/audit/logs',
    AUDIT_STATS: '/api/audit/stats',
    AUDIT_CACHE_REFRESH: '/api/audit/cache/refresh',

    TAG_CHANNELS: '/api/tags/channels',
    TAG_CHANNELS_RECOMMEND: '/api/tags/channels/recommend',
    TAG_MY_SUBSCRIBED: '/api/tags/me/subscribed',
    TAG_NEW_STATUS: '/api/tags/me/new-status',
    TAG_SUBSCRIBE_PREFIX: '/api/tags',
    TAG_POSTS_PREFIX: '/api/tags'
  }
};

module.exports = config;
