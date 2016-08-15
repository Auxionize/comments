/**
 * Created by yordan on 4/4/16.
 */
'use strict';

const processEnumObject = require('../utils/enum').processEnumObject;
const _ = require('lodash');
let CommentsSummary = null;
let CommentType = {
	Company: '' ,
	Auction: '' ,
	Bid: '',
	Reply: ''
};
let CommentState = {
	Active: '',
	Hidden: ''
};

processEnumObject(CommentType);
processEnumObject(CommentState);

module.exports = function (sequelize, User, Reference, BigFile, BigFileLink) {
	let DataTypes = sequelize.Sequelize;
	const LinkType = BigFileLink.LinkTypes;
	let Comment = sequelize.define('Comment', {
		type: {
			type: DataTypes.ENUM({values: Object.keys(CommentType)})
		},

		entityId: {
			type: DataTypes.INTEGER
		},

		text: {
			type: DataTypes.TEXT
		},

		date: {
			type: DataTypes.DATE
		},

		state: {
			type: DataTypes.ENUM({values: Object.keys(CommentState)}),
			allowNull: false
		}

	}, {
		hierarchy: true,
		classMethods: {
			plugSummaryModel: function(model) {
				CommentsSummary = model;
			},

			hasManyWith: function(model) {
				this.hasMany(model);
			},

			updateCache: function*(comment, direction, extraDecrement) {
				let self = this;

				var commentCache = yield CommentsSummary.findOne({where: {
					context: comment.type,
					entityId: comment.entityId
				}});

				if(commentCache === null && direction === 'increment') {
					yield CommentsSummary.create({
						CommentId: comment.id,
						context: comment.type,
						entityId: comment.entityId,
						totalComments: 1,
						totalParentComments: 1,
						dateLastAdded: comment.date
					});
				}
				else if(commentCache !== null && direction === 'increment') {
					if(comment.parentId === null) {
						++commentCache.totalParentComments;
					}

					++commentCache.totalComments;
					commentCache.CommentId = comment.id;
					commentCache.dateLastAdded = comment.date;

					yield commentCache.save();
				}
				else if(commentCache !== null && direction === 'decrement') {
					extraDecrement = extraDecrement || 0;

					if(comment.parentId === null) {
						--commentCache.totalParentComments;
					}

					--commentCache.totalComments;

					if(extraDecrement > 0) {
						commentCache.totalComments = commentCache.totalComments - extraDecrement;
					}

					var successor = yield self.findOne({where: {
						type: comment.type,
						entityId: comment.entityId,
						state: 'Active'
					},
						order: [['date', 'DESC']]
					});

					if(successor === null) {
						yield commentCache.destroy();
					}
					else {
						commentCache.CommentId = successor.id;
						commentCache.dateLastAdded = successor.date;
						yield commentCache.save();
					}

				}
			},

			addHidden: function(where, admin){
				if(!admin) where.state = CommentState.Active;
				return where;
			},

			ready: function() {
				this.scopedUser = User.scope({
					attributes: [
						'id',
						'type',
						'email',
						'fullName'
					]
				});

				this.scopedRef = Reference.scope({
					attributes: ['id', 'type'],
					include: [{
						model: Reference,
						as: 'root',
						attributes: ['id'],
						include: [{
							association: Reference.associations.Company,
							attributes: ['id', 'name']
						}]
					}]
				});

				this.addScope('defaultScope', {
					include: [
						{model: this.scopedUser, as: "User"},
						{model: this.scopedRef,	as: "Reference"},
						{model: this.scopedRef,	as: "AuthorReference"}
					]
				}, {override: true});
			},

			setState: function*(id, state) {
				var updateResult = yield this.update({state}, {where: {id}, returning: true});

				if(updateResult[0] && updateResult[0] > 0) {
					let comment = updateResult[1][0].dataValues;
					let direction = comment.state === 'Active' ? 'increment' : 'decrement';
					let extraDecrement = 0;

					if(comment.parentId === null && direction === 'decrement') {
						// check if has children and set them to Hidden
						let secondaryUpdateResult = yield this.update(
							{state},
							{
								where: {parentId: comment.id},
								returning: true
							});

						if(secondaryUpdateResult[0] > 0) {
							for(var i = 0; i < secondaryUpdateResult[1].length; i++) {
								if(!_.isEmpty(secondaryUpdateResult[1][i]._changed)) {
									extraDecrement++;
								}
							}
						}
					}

					yield this.updateCache(comment, direction, extraDecrement);
				}

				return updateResult;
			},

			makePublic: function*(id) {
				return yield this.update({ReferenceId: null},{where: {id}, returning: true});
			},

			add: function*(context, type, entityId, parentId, AuthorReferenceId, text, ReferenceId,  attachments) {
				var obj = {
					type,
					entityId,
					parentId,
					AuthorReferenceId,
					text,
					ReferenceId,
					attachments,
					UserId: context.user.id,
					date: context.now,
					state: CommentState.Active
				};

				var comment = yield this.create(obj);

				yield this.updateCache(comment, 'increment');

				for(let attachment of attachments) {
					yield BigFile.link(attachment.uuid, LinkType.COMM_ATTACHMENT, comment.id);
				}

				return comment;
			},

			getById: function*(id, admin) {
				let comment =  yield this.findById(id, {
					where: this.addHidden({}, admin),
					attributes: [
						'id',
						'date',
						'text',
						'state',
						'UserId',
						'entityId',
						'attachments',
						'ReferenceId',
						'AuthorReferenceId'
					],
					order: [
						['date', 'DESC'],
						[{model: Comment, as: 'children'}, 'date', 'ASC']
					],
					include: [
						{association: this.associations.CommentReports},
						{
							model: Comment,
							as: 'children',
							attributes: [
								'id',
								'text',
								'date',
								'state',
								'UserId',
								'parentId',
								'ReferenceId',
								'attachments',
								'AuthorReferenceId'
							],
							where: this.addHidden({}, admin),
							required: false,
							include: [
								{association: this.associations.CommentReports}
							]
						}
					]
				});


				for (let child of comment.children) {
					child.parent = child.dataValues.parent = comment.id;//comment.toJSON();
				}

				return comment;
			},

			index: function*(entityType, entityId, isAdmin, refId) {
				if(!isAdmin && !refId){
					return {data: 0,count: 0};
				}
				let where = {
					type: entityType,
					entityId: entityId,
					parentId: null
				};
				if(!isAdmin){
					where = {
						$and: [
							where,
							{state: CommentState.Active},
							{$or: [
								{ReferenceId : null},
								{ReferenceId: refId},
								{AuthorReferenceId: refId}
							]}
						]
					}
				}


				var comments = yield this.findAndCountAll({
					where,
					order: [
						[ 'date', 'DESC' ],
						[ { model: Comment, as: 'children'}, 'date', 'ASC']
					],
					include: [
						{association: this.associations.CommentReports},
						{
							model: Comment,
							as: 'children',
							where: {state: CommentState.Active},
							required: false,
							include: [
								{association: this.associations.CommentReports}
							]
						}
					]
				});


				for (let comment of comments.rows) {
					for (let child of comment.children) {
						child.parent = child.dataValues.parent = comment.id;//comment.toJSON();
					}
				}

				return {
					data: comments.rows,
					count: comments.count
				};
			}
		}
	});

	Comment.Types = CommentType;
	Comment.States = CommentState;

	/*
	 Relations
	 */
	Comment.belongsTo(User, {foreignKey: {notNull: true}});
	// The reference of the creator (or null for admins)
	Comment.belongsTo(Reference, {as: "AuthorReference"});
	// The reference that Comment ref is shared with (or null for public)
	Comment.belongsTo(Reference);

	return Comment;
};

module.exports.CommentType = CommentType;
module.exports.CommentState = CommentState;