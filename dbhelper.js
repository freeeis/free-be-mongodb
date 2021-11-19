const mongoose = require('mongoose');

/**
 * 统一处理mongodb异常需要报出的错误信息。
 * 遇到新的没有处理的错误时，需要在此方法中添加相应逻辑。
 *
 * @param ex
 * @returns {*}
 */
function unifyError(ex) {
    if (typeof ex === 'string') return ex;

    if (ex.errors) {
        let message = [];

        Object.keys(ex.errors).forEach((k) => {
            if (!message.includes(ex.errors[k].message)) {
                message.push(ex.errors[k].message);
            }
        });

        return message.join('\r\n');
    }

    switch (ex.name) {
        case 'CastError':
            return ex.value + ' is not a valida value';
        default:
            return ex.message;
    }
}

/**
 * Generate data for creating new db record or update existing one from the request body.
 * All data in the req.body should be cleaned up before calling this function.
 * @param model The db model to generate data for.
 * @param body The request body which contains all the fields that we need to generate data.
 * @param doc Null or the existing document we want to update.
 * @returns {Object} Return the new created or updated document according to the req.body.
 */
const generateData = async function (model, body, doc = undefined, fields = []) {
    if (!doc) doc = {};

    // 遍历数据定义中所有的字段，并到body中查找，如果找到则赋值。
    let keys = Object.keys(model.schema.paths);
    for (let i = 0; i < keys.length; i += 1) {
        let k = keys[i];

        // 指定字段
        if (fields && fields.length > 0) {
            if (fields.indexOf(k) < 0) continue;
        }

        let p = model.schema.paths[k];
        let instance = p.instance;
        let path = p.path;

        // 不能在这里统一判断value是不是为undefined。因为有的字段为嵌套字段。
        if (!instance || !path) continue;
        if (path === '_id' || path === 'id' || path === '__v') continue;

        // 处理直接赋值object类型的数据
        if (path.indexOf('.') > 0) {
            const field = path.split('.')[0];
            if (body[field]) {
                doc[field] = body[field];
            }
        }

        let pathList = path.split('.');
        let lastIndex = pathList.length - 1;
        path = pathList[lastIndex];
        let value = body[path];

        // 重新检查body中的数据，此时应该有内容，如果没有则返回。
        if (value === undefined) continue;

        // 寻找应该持有此数据的对象（直接父级）
        let parent = doc;
        for (let i = 0; i < lastIndex; i += 1) {
            parent = parent[pathList[i]] = parent[pathList[i]] || {};
        }

        // 检查数据定义中的类型并做相应调整。
        switch (instance.toLowerCase()) {
            case 'object':
                if (typeof value !== 'object') {
                    try {
                        parent[path] = JSON.parse(value);
                    } catch (ex) {
                        throw ex;
                    }
                } else {
                    parent[path] = value;
                }
                break;
            case 'array':
                // 如果定义为数组，客户端有两种操作。1. 传入数组直接替换。2. 传入非数组往已有数组中添加数据。
                if (!Array.isArray(value)) {
                    parent[path] = parent[path] || [];

                    parent[path].push(value);
                }
                else {
                    parent[path] = value;
                }

                // set undefined item to null
                for (let j = 0; j < parent[path].length; j += 1) {
                    const ppi = parent[path][j];

                    if (typeof ppi === 'undefined') {
                        parent[path][j] = null;
                    }
                }
                break;
            case 'objectid':
                // 如果是ObjectId，做转换。

                if (mongoose.Types.ObjectId.isValid(value)) {
                    value = mongoose.Types.ObjectId(value);
                }
                else {
                    // 不是合法的objectid，但有可能是省市等信息
                    // let pc, bank;
                    switch (p.options.ref) {
                        // case 'province_city':
                        //     pc = await Province_City.find({Name: new RegExp(value), Level: path.indexOf('Province') >= 0 ? 1 : 2},{_id:1, Name: 1});
                        //     if(pc && pc.length === 1){
                        //         value = pc[0]._id;
                        //     }
                        //     else if (pc && pc.length > 1){
                        //         let ps = [];
                        //         for(let p = 0; p < pc.length; ++p)
                        //         {
                        //             ps.push(pc[p].Name);
                        //         }
                        //         throw path + '为不确定的值；【' + ps.join(',') + ']';
                        //     }
                        //     else {
                        //         throw path + '不是合法的值！';
                        //     }
                        //     break;
                        // case 'bank':
                        //     // 可能是银行名字
                        //     bank = await Bank.find({Name: new RegExp(value)}, {_id: 1, Name: 1});
                        //     if(bank && bank.length === 1){
                        //         value = bank[0]._id;
                        //     }
                        //     else if (bank && bank.length > 1){
                        //         let bs = [];
                        //         for(let b = 0; b < bank.length; ++b)
                        //         {
                        //             bs.push(bank[b].Name);
                        //         }
                        //         throw path + '为不确定的值；【' + bs.join(',') + ']';
                        //     }
                        //     else {
                        //         throw path + '不是合法的值！';
                        //     }
                        //     break;
                        default:
                            throw path + ' is not a valid value!';
                    }
                }

                parent[path] = value;
                break;
            case 'number':
                // 如果是数字，做转换。
                // 替换中间的逗号，并清楚两边的空格
                if (typeof value !== 'undefined' && value !== null) {
                    value = value.toString().trim().replace(',', '');
                    value = Number(value);
                }
                parent[path] = value;
                break;
            default:
                // 其它情况直接赋值。
                parent[path] = value;
                break;
        }
    }

    return doc;
};

module.exports = (app) => {
    return {
        /**
         * The common function to find documents from the database.
         * Before calling this function, the query and options for paginate plugin
         * should be ready in res.locals as res.locals.filter and res.locals.options.
         * If not specified, the default options will be {page: 1, limit: 10, lean: true, sort:{LastUpdateDate: 'desc'}}.
         * The middleware will not return data or error to the client directly, but store the information in the res.locals.
         * And the app.js will return data accordingly.
         *
         * @param model The db model from which we want to find data.
         * @param errorCallback The optional error callback for Promise rejection
         * @returns {function(*, *, *): *} The async middleware to query the data using paginate plugin.
         * @constructor
         */
        FindDocuments: function (mdl, errorCallback = undefined) {
            return async (req, res, next) => {
                const model = app.models && app.models[mdl];
                if (!model) throw new Error(`Model ${mdl} is not exists!`);

                // let offset  = req.query.offset;
                let page = Number(req.query.page || 1);
                let limit = Number(req.query.limit || 8);

                let query = res.locals.filter || {};
                let options = res.locals.options || {};

                if (!('page' in options) && page) options.page = page;
                if (!('limit' in options) && limit) options.limit = limit;
                options.limit = options.limit > res.app.config.MaxPageLimit ? res.app.config.MaxPageLimit : options.limit || 8;
                //if(offset) options.offset = Number(offset);
                if (!('lean' in options)) options.lean = true;
                if (!('sort' in options)) options.sort = { LastUpdateDate: 'desc' };
                options.leanWithId = false; // 不自动产生id字段
                // options.sort.field = 'LastUpdateDate'
                // options.sort.test = 'desc'

                try {
                    const foundData = await model.paginate(query, options);

                    // clear fields
                    let docs = [];
                    if (foundData && foundData.docs && res.locals.fields.length > 0) {
                        for (let i = 0; i < foundData.docs.length; i += 1) {
                            let doc = options.lean ? foundData.docs[i] : foundData.docs[i]._doc;
                            const keys = Object.keys(doc);
                            for (let j = 0; j < keys.length; j += 1) {
                                const k = keys[j];
                                if (res.locals.fields.indexOf(k) < 0) {
                                    delete doc[k];
                                }
                            }

                            if (doc && Object.keys(doc).length > 0) docs.push(doc);
                        }

                        foundData.docs = docs;
                    }

                    res.locals.data = Object.assign(res.locals.data, foundData);

                    // clear local vars
                    delete res.locals.options;
                    delete res.locals.filter;
                } catch (ex) {
                    app.logger.debug(ex.message);
                    if (errorCallback) return errorCallback();
                    else {
                        res.makeError(500, unifyError(ex), mdl);
                        if (next)
                            return next('route');
                        else return;
                    }
                }

                if (next)
                    return next();
                else return;
            };
        },

        // find out all without pagination
        FindAllDocuments: function (mdl, errorCallback = undefined) {
            return async (req, res, next) => {
                const model = app.models && app.models[mdl];
                if (!model) throw new Error(`Model ${mdl} is not exists!`);

                let query = res.locals.filter || {};
                let options = res.locals.options || {};

                try {
                    let foundData = model.find(query);
                    if (options.lean)
                        foundData = foundData.lean();
                    if (options.populate)
                        foundData = foundData.populate(options.populate)
                    if (options.sort)
                        foundData = foundData.sort(options.sort)
                    else
                        foundData = foundData.sort({ LastUpdateDate: 'desc' })
                        
                    if (options.limit)
                        foundData = foundData.limit(options.limit)
                    if (options.skip)
                        foundData = foundData.skip(options.skip)

                    foundData = await foundData;

                    // clear fields
                    let docs = [];
                    if (foundData && res.locals.fields.length > 0) {
                        for (let i = 0; i < foundData.length; i += 1) {
                            let doc = options.lean ? foundData[i] : foundData[i]._doc;
                            const keys = Object.keys(doc);
                            for (let j = 0; j < keys.length; j += 1) {
                                const k = keys[j];
                                if (res.locals.fields.indexOf(k) < 0) {
                                    delete doc[k];
                                }
                            }

                            if (doc && Object.keys(doc).length > 0) docs.push(doc);
                        }

                        foundData = docs;
                    }

                    res.locals.data = Object.assign(res.locals.data, { docs: foundData, total: foundData.length });

                    // clear local vars
                    delete res.locals.options;
                    delete res.locals.filter;
                } catch (ex) {
                    app.logger.debug(ex.message);
                    if (errorCallback) return errorCallback();
                    else {
                        res.makeError(500, unifyError(ex), mdl);
                        if (next)
                            return next('route');
                        else return;
                    }
                }

                if (next)
                    return next();
                else return;
            };
        },

        /**
         * Aggregation
         *
         * @param model
         * @param errorCallback
         * @returns {Function}
         * @constructor
         */
        Aggregate: (mdl, errorCallback = undefined) => {
            return async (req, res, next) => {
                const model = app.models && app.models[mdl];
                if (!model) throw new Error(`Model ${mdl} is not exists!`);

                res.locals.options = res.locals.options || [];
                try {
                    res.locals.data = await model.aggregate(res.locals.options);
                } catch (ex) {
                    app.logger.debug(ex.message);
                    if (errorCallback) return errorCallback();
                    else {
                        res.makeError(500, unifyError(ex), mdl);
                        if (next)
                            return next('route');
                        else return;
                    }
                }

                if (next)
                    return next();
                else return;
            };
        },


        /**
         * To create a new document in the db.
         * All the fields should be in the req.body.
         * The middleware will not return data or error to the client directly, but store the information in the res.locals.
         * And the app.js will return data accordingly.
         *
         * @param model The db model in which we want to create new record.
         * @param fields
         * @returns {function(*, *, *): *} Return an async middleware.
         * @constructor
         */
        CreateDocument: (mdl) => {
            return async (req, res, next) => {
                const model = app.models && app.models[mdl];
                if (!model) throw new Error(`Model ${mdl} is not exists!`);

                // use body in res or req, res has higher priority as it could be set in previous middleware
                let body = (res.locals.body && Object.keys(res.locals.body).length) ? res.locals.body : req.body;

                if (!body || Object.keys(body).length === 0) {
                    res.makeError(400, 'Nothing to create!'), mdl;
                    if (next)
                        return next('route');
                    else return;
                }

                try {
                    let newDoc = await generateData(model, body, undefined, res.locals.fields);
                    let create = await model.create(newDoc);
                    res.locals.data = Object.assign(res.locals.data, { id: create.id });
                    delete res.locals.body;
                } catch (ex) {
                    app.logger.debug(ex.message);
                    res.makeError(500, unifyError(ex), mdl);
                    if (next)
                        return next('route');
                    else return;
                }
                if (next)
                    return next();
                else return;
            };
        },


        /**
         * Update existing document.
         * The method will query the existing document according to req.params.id first, and then update fields according to
         * the req.body.
         *
         * The middleware will not return data or error to the client directly, but store the information in the res.locals.
         * And the app.js will return data accordingly.
         * @param model
         * @param fields
         * @returns {function(*, *, *): *}
         * @constructor
         */
        UpdateDocument: (mdl) => {
            return async (req, res, next) => {
                const model = app.models && app.models[mdl];
                if (!model) throw new Error(`Model ${mdl} is not exists!`);

                // use body in res or req, res has higher priority as it could be set in previous middleware
                let body = (res.locals.body && Object.keys(res.locals.body).length) ? res.locals.body : req.body;

                if (!body || Object.keys(body).length === 0) {
                    res.makeError(400, 'Nothing to update!', mdl);
                    if (next)
                        return next('route');
                    else return;
                }

                let id = req.params.id || body.id;
                let doc = (res.locals.doc && Object.keys(res.locals.doc).length) ?
                    res.locals.doc :
                    (res.locals.filter && Object.keys(res.locals.filter).length) ?
                        await model.findOne(res.locals.filter) :
                        await model.findOne({ id: id });

                if (doc) {
                    try {
                        await generateData(model, body, doc, res.locals.fields);
                        await doc.save();
                        res.locals.data = Object.assign(res.locals.data, doc._doc);
                        delete res.locals.body;
                        delete res.locals.filter;
                        delete res.locals.doc;
                    } catch (ex) {
                        app.logger.debug(ex.message);
                        res.makeError(500, unifyError(ex), mdl);
                        if (next)
                            return next('route');
                        else return;
                    }
                }
                else {
                    app.logger.debug('Cannot find the document to update: ' + id);
                    res.makeError(400, 'Cannot find the document to update!', mdl);
                    if (next)
                        return next('route');
                }

                if (next)
                    return next();
            };
        },


        /**
         * Function to return the middleware for deleting a specific model document.
         *
         * The middleware will not return data or error to the client directly, but store the information in the res.locals.
         * And the app.js will return data accordingly.
         *
         * @param model The db model from which the document should be deleted.
         * @returns {function(*, *, *): *} Return an async middleware.
         * @constructor
         */
        DeleteDocument: (mdl) => {
            return async (req, res, next) => {
                const model = app.models && app.models[mdl];
                if (!model) throw new Error(`Model ${mdl} is not exists!`);

                try {
                    if (res.locals.filter && Object.keys(res.locals.filter).length) {
                        await model.deleteMany(res.locals.filter);
                    }
                    else {
                        let id = req.params.id || req.body.id;
                        await model.deleteOne({ id });
                    }
                    // res.locals.data = {};
                    delete res.locals.filter;
                } catch (ex) {
                    app.logger.debug(ex.message);
                    res.makeError(500, unifyError(ex), mdl);
                    if (next)
                        return next('route');
                    else return;
                }

                if (next)
                    return next();
                else return;
            };
        }
    }
};

module.exports.UnifyError = unifyError;
