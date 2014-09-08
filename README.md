## share-access

Access-control plugin for [sharejs](https://github.com/share/ShareJS), [racer](https://github.com/derbyjs/racer) and [derby](https://github.com/derbyjs/derby)

### Instalation

- Install: `npm install share-access`

### Usage

Plug in the middleware:

```js
var shareAccess = require('share-access');

// plug in
shareAccess.setup(shareInstance);
// Or
derby.use(shareAccess);
// Or
racer.use(shareAccess);
```

Using share-access you can control "create", "read", "update", and "delete" 
database operation for every collections. You can use two types of rules: 
'allow' and 'deny'. By default all the operations are denied. So, you should
add some rules to allow them. For example, If at least one 'allow'-rule allows 
the write, and no 'deny'-rules deny the write, then the write is allowed to 
proceed. 

You can call 'allow' and 'deny'-rules as many times as you like. The functions 
should return true if they think the operation should be allowed for 'allow' 
rules and denied for 'deny'-rules. Otherwise they should return false, or 
nothing at all (undefined).

#### Create

```js
// Allow create-operation for collection 'items'

// docId - id of your doc for access-control
// doc   - document object
// session - your connect session
// origin - 'server' or 'browser'

shareAccess.allowCreate('items', function(docId, doc, session, origin){
  return true;
});

// Deny creation if user is not admin
shareAccess.denyCreate('items', function(docId, doc, session, origin){
  return !session.isAdmin;
});

// So, finally, only admins can create docs in 'items' collection
// the same results is if you just write:

shareAccess.allowCreate('items', function(docId, doc, session, origin){
  return session.isAdmin;
});
```
#### Read

Interface is like 'create'-operation
```js
shareAccess.allowRead('items', function(docId, doc, session, origin){
  // Allow all operations
  return true;
});

shareAccess.denyRead('items', function(docId, doc, session, origin){
  // But only if the reader is owner of the doc
  return doc.ownerId !== session.userId;
});
```

#### Delete

Interface is like 'create'-operation

```js
shareAccess.allowDelete('items', function(docId, doc, session, origin){
  // Only owners can delete docs
  return doc.ownerId == session.userId;
});

shareAccess.denyDelete('items', function(docId, doc, session, origin){
  // But deny deletion if it's a special type of docs
  return doc.type === 'liveForever';
});
```

#### Update

```js
// docId - id of your doc for access-control
// oldDoc  - document object (before update)
// newDoc  - document object (after update)
// path    - array of update path segments - f.e = ['name'] if we are 
//           changing doc.name
// session - your connect session
// origin - 'server' or 'browser'

shareAccess.allowUpdate('items', allowUpdateAll);

function allowUpdateAll(docId, oldDoc, newDoc, path, session, origin){
  return true;
}

shareAccess.denyUpdate('items', denyForNonAdmin);

function denyForNonAdmin(docId, oldDoc, newDoc, path, session, origin){
  // If you are not an admin you can change only 'description'
  return !session.isAdmin && path[0] !== 'description';
}
```

## MIT License
Copyright (c) 2014 by Artur Zayats

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
