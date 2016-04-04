/**
 * Created by yordan on 4/4/16.
 */
'use strict';

const processEnumObject = require('../utils/enum').processEnumObject;
const prepareQuery = require('../utils/queries').prepareQuery;
let CommentReportState = {
	Pending: '' ,
	Done: ''
};

processEnumObject(CommentReportState);

module.exports = function (sequelize, User, Comment) {
	let DataTypes = sequelize.Sequelize;
	let CommentReport = sequelize.define('CommentReport', {
		note: {
			type: DataTypes.STRING
		},
		state: {
			type: DataTypes.ENUM({values: Object.keys(CommentReportState)}),
			allowNull: false
		}

	}, {
		classMethods: {
			commentReportsIndex: function*(criteria) {
				let commentWhere = {};

				if(criteria.search && criteria.search.commentState){
					commentWhere.state = criteria.search.commentState;
				}

				let include = [
					{
						association: this.associations.Comment,
						where: commentWhere,
						required: true
					},
					{
						association: this.associations.User,
						attributes: ['id', 'fullName']
					}
				];

				let query = prepareQuery(criteria, ['state'], {id: -1});
				let count = yield this.count(query);

				query.include = include;

				let comments = yield this.findAll(query);
				return {
					count: count,
					data: comments
				};
			}
		}
	});

	/*
		Relations
	 */
	CommentReport.belongsTo(User, {foreignKey: {allowNull: false}});
	CommentReport.belongsTo(Comment, {foreignKey: {allowNull: false}});

	return CommentReport;
};

module.exports.CommentReportState = CommentReportState;