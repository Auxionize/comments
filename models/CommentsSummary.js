/**
 * Created by yordan on 5/10/16.
 */
'use strict';

const processEnumObject = require('../utils/enum').processEnumObject;
let ContextTypes = {
	Company: '' ,
	Auction: '',
	Bid: '',
	Reply: ''
};

processEnumObject(ContextTypes);

module.exports = function (sequelize, Comment) {
	let DataTypes = sequelize.Sequelize;
	let CommentsSummary = sequelize.define('CommentsSummary', {
		context: {
			type: DataTypes.ENUM({values: Object.keys(ContextTypes)}),
			allowNull: false
		},
		entityId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		totalComments: {
			type: DataTypes.INTEGER,
			allowNull: false,
			default: 0
		},
		totalParentComments: {
			type: DataTypes.INTEGER,
			allowNull: false,
			default: 0
		},
		dateLastAdded: {
			type: DataTypes.DATE,
			allowNull: false
		}

	});

	CommentsSummary.ContextTypes = ContextTypes;

	/*
	 Relations
	 */
	CommentsSummary.belongsTo(Comment, {foreignKey: {allowNull: false}});

	return CommentsSummary;
};