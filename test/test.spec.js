/**
 * Created by yordan on 4/4/16.
 */
'use strict';

// Include required modules
var co = require('co');
var chai = require('chai');
chai.use(require('chai-as-promised'));
var expect = chai.expect;
require('co-mocha');
var randomizeString = require('stray');
var Sequelize = require('sequelize');
var sequelize = new Sequelize('comments', 'postgres', '24262426', {
	host: 'localhost',
	dialect: 'postgres'
});

// model generator
var addModel = function(name, attrs, options){
	var model = sequelize.define(name, attrs, options);

	return model;
};

var DataTypes = Sequelize;

const processEnumObject = require('../utils/enum').processEnumObject;

let	LinkType = {
	USER_BUCKET: '',
	AUCTION_ATTACHMENT: '',
	AUCTION_CONTRACT: '',
	COMM_ATTACHMENT: ''
};
let CommentType = {
	Company: '' ,
	Auction: '' ,
	Bid: '',
	Reply: ''
};
let CommentReportState = {
	Pending: '' ,
	Done: ''
};

processEnumObject(LinkType);
processEnumObject(CommentType);
processEnumObject(CommentReportState);

var EntityModel = addModel('Entity', {name: {type: DataTypes.STRING}});
var UserModel    = addModel('User', {name: {type: DataTypes.STRING}});
var ReferenceModel = addModel('Reference', {name: {type: DataTypes.STRING}});
var BigFileLinkModel = addModel('BigFileLink', {
		type : {
			type: DataTypes.ENUM({values: Object.keys(LinkType)}),
			nullAllowed: false
		},
		referredBy: {
			type: DataTypes.INTEGER
		},
		note :{
			type:DataTypes.TEXT
		}
	});
var BigFileModel = addModel('BigFile', {
		name: {
			type: DataTypes.STRING,
			allowNull: true
		},
		uuid: {
			type: DataTypes.UUID,
			defaultValue: DataTypes.UUIDV4,
			unique: true,
			allowNull: false
		},
		mimeType: {
			type: DataTypes.STRING,
			allowNull: true
		},
		size: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		date: {
			type: DataTypes.DATE,
			allowNull: true
		}
	},
	{
		classMethods: {
			findByUUID: function (uuid) {
				return this.findOne({
					where: {
						uuid
					}
				});
			},
			unlink: function (uuid, type, referredBy) {
				var that = this;
				const Link = BigFileLinkModel;
				return co(function* () {
					const link = yield Link.findOne({
						where: {
							type,
							referredBy
						},
						include: [{
							model: that,
							where: {
								uuid
							}
						}]
					});
					if (link == null) {
						return;
					}
					yield link.destroy();
					return link;
				});
			},
			link: function (uuid, type, referredBy) {
				var that = this;
				const Link = BigFileLinkModel;
				return co(function* () {
					const file = yield that.findByUUID(uuid);
					return yield Link.create({
						BigFileId: file.id,
						type,
						referredBy
					});
				});
			}
		}
	});


var index = require('../index')(sequelize, UserModel, ReferenceModel, BigFileModel, BigFileLinkModel);
var Comment = index.Comment;
var CommentReport = index.CommentReport;
var e1, u1, u2, c1, cr1, fromReference, toReference;

describe('Array', function() {
	// executed before each test
	beforeEach(function* () {
		yield UserModel.sync({force: true});
		yield ReferenceModel.sync({force: true});
		yield BigFileLinkModel.sync({force: true});
		yield BigFileModel.sync({force: true});
		yield Comment.sync({force: true});
		yield CommentReport.sync({force: true});
		yield EntityModel.sync({force: true});

		e1 = yield EntityModel.create({name: randomizeString()});
		u1 = yield UserModel.create({name: randomizeString()});
		u2 = yield UserModel.create({name: 'Reporter-' + randomizeString()});
		fromReference = yield ReferenceModel.create({name: randomizeString()});
		toReference = yield ReferenceModel.create({name: randomizeString()});
	});

	let seedData = function* () {
		 var context = {
			 user: {id: u1.id},
			 now: Date.now()
		 };

		c1 = yield Comment.add(
			context,
			CommentType.Auction,
			e1.id,
			null,
			fromReference.id,
			'Hello world comment',
			toReference.id,
			[]
		);

		cr1 = yield CommentReport.create({
			UserId: u2.id,
			CommentId: c1.id,
			note: 'Blame something',
			state: CommentReportState.Pending
		});


	};

	it('should add comment and comment report', function*() {
		yield seedData();

		expect(c1.id).to.be.a('number');
		expect(cr1.id).to.be.a('number');
	});

	it('should ignore comment report', function*() {
		yield seedData();

		let report = yield CommentReport.findById(cr1.id);
		report.state = CommentReportState.Done;
		yield report.save();

		expect(report.state).to.equal(CommentReportState.Done);
	});

	it('should make a comment public', function*() {
		yield  seedData();
		yield Comment.makePublic(c1.id);
		let publicComment = yield Comment.findById(c1.id);

		expect(publicComment.ReferenceId).to.equal(null);
	});
});