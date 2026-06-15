const config = {
  BASE_URL: 'http://localhost:8223',
  WS_URL: 'ws://localhost:8223/ws',
  API: {
    REGISTER: '/api/users/register',
    LOGIN: '/api/users/login',
    ISLAND: '/api/users/me/island',
    INSIGHT_REPORT: '/api/users/me/insight-report',
    FAVORITES_BY_TAG: '/api/users/me/favorites/by-tag',
    TOGGLE_FAVORITE_PREFIX: '/api/users/me/favorites',
    TAG_SKIN: '/api/users/me/tag-skin',
    PRIVATE_GROUPS: '/api/users/me/private-groups',
    USER_PUBLIC_PREFIX: '/api/users/public',

    OCEAN: '/api/feed/ocean',
    HOT_TAGS: '/api/feed/hot-tags',
    DEEP_SEARCH: '/api/feed/search',
    POST_DETAIL_PREFIX: '/api/feed/posts',

    CREATE_POST: '/api/posts',
    MY_POSTS: '/api/posts/me',
    POST_PREFIX: '/api/posts',
    UPDATE_POST: '/api/posts',
    DELETE_POST: '/api/posts',

    CONVERSATIONS: '/api/messages/conversations',
    SEND_MESSAGE: '/api/messages/send',
    REQUEST_REVEAL: '/api/messages/conversations/reveal',
    UNREAD_COUNT: '/api/messages/unread',

    PAYMENT_PLANS: '/api/payments/plans',
    CHECKOUT: '/api/payments/checkout',
    MY_ORDERS: '/api/payments/orders/me',

    COMMERCE_DERIVATIVES: '/api/commerce/derivatives',
    DERIVATIVE_WAITLIST_PREFIX: '/api/commerce/derivatives',
    COMMERCE_CAMPS: '/api/commerce/camps',
    CAMP_INQUIRY_PREFIX: '/api/commerce/camps'
  }
};

module.exports = config;
