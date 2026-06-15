const express = require('express');
const privateGroupController = require('../controllers/privateGroupController');
const { auth, requirePremium } = require('../middlewares/auth');
const {
  createPrivateGroupValidator,
  groupIdValidator,
  createGroupPostValidator,
  inviteCodeValidator,
  inviteMemberValidator,
  removeMemberValidator,
  searchUserValidator,
  paginationValidator
} = require('../middlewares/validator');

const router = express.Router();

router.use(auth);

router.post('/', requirePremium, createPrivateGroupValidator, privateGroupController.createGroup);
router.get('/me', requirePremium, privateGroupController.getMyGroups);
router.get('/search-users', searchUserValidator, privateGroupController.searchUsersForInvite);
router.post('/join', inviteCodeValidator, privateGroupController.joinByInviteCode);
router.get('/:groupId', groupIdValidator, privateGroupController.getGroupDetail);
router.post('/:groupId/invite-code/refresh', groupIdValidator, privateGroupController.refreshInviteCode);
router.post('/:groupId/invite', inviteMemberValidator, privateGroupController.inviteMember);
router.delete('/:groupId/members/:memberId', removeMemberValidator, privateGroupController.removeMember);
router.post('/:groupId/leave', groupIdValidator, privateGroupController.leaveGroup);
router.post('/:groupId/posts', createGroupPostValidator, privateGroupController.createPost);
router.get('/:groupId/posts', groupIdValidator, paginationValidator, privateGroupController.getGroupPosts);

module.exports = router;
