/**
 * Created by yordan on 4/4/16.
 */
'use strict';

module.exports = function(sequelize, User, Reference, BigFile, BigFileLink) {
	let Comment = require('./models/Comment')(sequelize, User, Reference, BigFile, BigFileLink);
	let CommentReport = require('./models/CommentReport')(sequelize, User, Comment);
	let CommentsSummary = require('./models/CommentsSummary')(sequelize, Comment);

	Comment.hasManyWith(CommentReport);
	Comment.plugSummaryModel(CommentsSummary);

	return {Comment, CommentReport, CommentsSummary};
};