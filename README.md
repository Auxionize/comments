# Comments - Generic Comments for Sequalize

## Simple to use

Comments is designed to be simplest way to integrate and use comment system.

```
var object = require('index')(sequelize, User, Reference, BigFile, BigFileLink);
```
 
``` 
// *** Comment ***

var comment = object.Comment;

// Comment types
comment.CommentType;

// Comment states
comment.States;

// Index method
yield.comment.index(entityType, entityId, isAdmin, refId);

// Add new comment
var newComment = yield comment.add(context, type, entityId, parentId, AuthorReferenceId, text, ReferenceId,  attachments);

// Make the comment public
yield comment.makePublic(id);

// Set comment state
yield comment.setState(id, state);

// Custom getById
yield comment.getById(id, admin);
```

```
// *** Comment Report ***

var commentReport = object.CommentReport;

// Comment report states
commentReport.States;

// Comment report index where result {count: Number, data: Array};
let result = commentReport.commentReportsIndex(criteria);

```