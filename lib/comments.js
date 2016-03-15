'use strict';
const LinkType = require('aux-model/models/model-files/bigfilelink').LinkType;
const processEnumObject = require('aux-model/util/enum').processEnumObject;
const _ = require('lodash');
const prepareQuery = require('aux-api-core/common/queries').prepareQuery;

let CommentType = {
    Company: '' ,
    Auction: '' ,
    Bid: '',
    Reply: '',
}
processEnumObject(CommentType);

let CommentState = {
    Active: '',
    Hidden: '',
}
processEnumObject(CommentState);

module.exports = function (sequelize, DataTypes) {
    let models = sequelize.models;

    let Comment = sequelize.define('Comment', {

        type: {
            type: DataTypes.ENUM({values: Object.keys(CommentType)}),
        },

        entityId: {
            type: DataTypes.INTEGER,
        },

        text: {
            type: DataTypes.TEXT,
        },

        date: {
            type: DataTypes.DATE,
        },

        state: {
            type: DataTypes.ENUM({values: Object.keys(CommentType)}),
            allowNull: false,
        },

    }, {

        hierarchy: true,

        classMethods: {

            addHidden: function(where, admin){
                if(!admin) where.state = CommentState.Active;
                return where;
            },

            ready: function (models) {

                this.scopedUser = models.User.scope({
                    attributes: ['id', 'email', 'username', 'fullName', 'type'],
                });

                this.scopedRef = models.Reference.scope({
                    attributes: ['id', 'type'],
                    include: [{
                        model: models.Reference,
                        as: 'root',
                        attributes: ['id'],
                        include: [{
                            association: models.Reference.associations.Company,
                            attributes: ['id', 'name'],
                        }]
                    }]
                });

                this.addScope('defaultScope', {
                    include: [
                        {model: this.scopedUser, as: "User"},
                        {model: this.scopedRef,	as: "Reference"},
                        {model: this.scopedRef,	as: "AuthorReference"},
                    ],
                }, {override: true});
            },

            associate: function (models) {
                this.hasMany(models.CommentReport);
                this.belongsTo(models.User, {foreignKey: {notNull: true}});
                // The reference of the creator (or null for admins)
                this.belongsTo(models.Reference, {as: "AuthorReference"});
                // The reference that this ref is shared with (or null for public)
                this.belongsTo(models.Reference);
            },


            setState: function*(id, state) {
                return yield this.update({state},{where:{id}, returning:true});
            },

            makePublic: function*(id) {
                return yield this.update({ReferenceId:null},{where:{id}, returning:true});
            },

            add: function*(context, type, entityId, parentId, AuthorReferenceId, text, ReferenceId,  attachments) {
                var comment;
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
                    state: CommentState.Active,
                }
                comment = yield this.create(obj);

                for(let attachment of attachments) {
                    yield sequelize.models.BigFile.link(attachment.uuid, LinkType.COMM_ATTACHMENT, comment.id);
                }

                return comment;
            },

            getById: function*(id, admin) {
                let comment =  yield this.findById(id, {
                    where: this.addHidden({}, admin),
                    attributes: ['id', 'entityId', 'text', 'ReferenceId', 'AuthorReferenceId', 'attachments', 'UserId', 'date', 'state'],
                    order: [
                        ['date', 'DESC'],
                        [{model: Comment, as: 'children'}, 'date', 'ASC']
                    ],
                    include: [
                        {association: this.associations.CommentReports},
                        {
                            model: Comment,
                            as: 'children',
                            attributes: ['id', 'text', 'ReferenceId', 'AuthorReferenceId', 'attachments', 'UserId', 'date', 'state', 'parentId'],
                            where: this.addHidden({}, admin),
                            required: false,
                            include: [
                                {association: this.associations.CommentReports,},
                            ]
                        },
                    ]
                });


                for (let child of comment.children) {
                    //yield this.attachAttachments(child);
                    child.parent = child.dataValues.parent = comment.toJSON();
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
                    parentId: null,
                };
                if(!isAdmin){
                    where = {
                        $and: [
                            where,
                            {state: CommentState.Active},
                            {$or: [
                                {ReferenceId : null},
                                {ReferenceId: refId},
                                {AuthorReferenceId: refId},
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
                                {association: this.associations.CommentReports},
                            ]
                        },
                    ]
                });


                for (let comment of comments.rows) {
                    for (let child of comment.children) {
                        child.parent = child.dataValues.parent = comment.toJSON();
                    }
                }

                return {
                    data: comments.rows,
                    count: comments.count
                };
            },


        }
    });

    Comment.Types = CommentType;

    return Comment;
};

module.exports.CommentType = CommentType;
module.exports.CommentState = CommentState;
