const path = require("path");
const express = require(path.resolve('./') + "/node_modules/express");
const mongoose = require('mongoose');
// const mongoosePaginate = require("mongoose-paginate");
const mongoosePaginate = require("./paginate.js");
const beautifyUnique = require("mongoose-beautiful-unique-validation");


/**
 * 更新数据库索引。
 *
 * 目前只删除已经不存在的索引，新添加的mongoose在必要时会自动添加。
 *
 * @constructor
 */
// const _updateIndexes = async function (app, db) {
//     const models = Object.keys(db.models);
//     let errorMsg = '';
//     for (let i = 0; i < models.length; i += 1) {
//         let allFields = [];
//         let model = db.models[models[i]];
//         // 获取数据库定义中的索引
//         let index = [];

//         const CheckFields = function (m) {
//             const keys = Object.keys(m.schema.paths) || [];
//             for (let i = 0; i < keys.length; i += 1) {
//                 let p = keys[i];
//                 let pp = m.schema.paths[p];
//                 if (pp._index !== null) {
//                     // pp._index.Name = p;
//                     // index.push(pp._index);
//                     // index.push(pp.path);
//                     index.push(pp);
//                 }

//                 if (pp.schema && pp.schema.paths) {
//                     CheckFields(pp);
//                 }

//                 // 同一个数据库表中，字段不能重复，除了数组（）。
//                 if (allFields.indexOf(pp.path) >= 0 &&
//                     allFields.indexOf(pp.path) !== allFields.lastIndexOf(pp.path) &&
//                     pp.path !== '_id' &&
//                     m.instance !== 'Array') {
//                     throw '数据表' + m.modelName + '存在重复的字段名' + pp.path;
//                 }
//                 else {
//                     allFields.push(pp.path);
//                 }
//             }
//         };

//         CheckFields(model);

//         if (!index || index.length <= 0) continue;

//         // 获取数据库实际所有的索引
//         let rIndex = 0;
//         try {
//             rIndex = await ((model.collection).indexes());
//         } catch (e) {
//             app.logger.error(e.stack);
//         }
//         if (!rIndex || rIndex.length < 0) continue;

//         for (let j = 0; j < rIndex.length; j += 1) {
//             // TODO: 假设索引中只有一个key，目前没问题，但以后有风险！
//             const key = Object.keys(rIndex[j].key)[0];
//             if (key === '_id') continue;
//             const index_ind = index.findIndex((pp) => { return pp.path === key; });
//             if (index_ind >= 0) {
//                 index.splice(index_ind, 1);
//                 continue;
//             }

//             // 删除已经不存在的index
//             await model.collection.dropIndex(rIndex[j].name);
//         }

//         // 到这里，如果index列表里还有，说明需要添加新index，但不能自动添加，因为生产环境会影响性能。提示去手动添加。
//         if (index.length > 0) {
//             errorMsg = errorMsg || (model.modelName + ' 需要手动创建索引: \n');
//             for (let k = 0; k < index.length; ++k) {
//                 const ind = index[k];
//                 errorMsg += 'db.' + model.collection.name + '.createIndex({' + ind.path + ': 1}, {unique: ' + !!ind._index.unique + ', sparse: ' + !!ind._index.sparse + '})\n';
//             }
//         }
//     }

//     if (errorMsg) {
//         app.logger.error(errorMsg);
//         process.exit(-1);
//     }
// };

module.exports = (app, mdl) => {
    const config = mdl.config;

    const connectionString = `mongodb://${config.dbHost}:${config.dbPort}/${config.dbName}`;

    //  mongoose.Promise = global.Promise;//如果有promise的问题，可以用这个试试
    app.logger.debug(`正在连接数据库(${process.env.NODE_ENV}): ${connectionString}`)

    const tryConnect = () => {
        mongoose.connect(connectionString, { autoIndex: config.autoCreateIndexes || false });//连接mongodb数据库
    }
    tryConnect();

    // 实例化连接对象
    let db = mongoose.connection;
    db.tryConnect = tryConnect;

    db.validateSchema = async function () {
        if (!db) {
            throw 'Not connected tot he db yet!';
        }

        const models = Object.keys(db.models);
        let errorMsg = '';
        for (let i = 0; i < models.length; i += 1) {
            let allFields = [];
            let model = db.models[models[i]];
            // 获取数据库定义中的索引
            let index = [];

            const CheckFields = function (m) {
                const keys = Object.keys(m.schema.paths) || [];
                for (let j = 0; j < keys.length; j += 1) {
                    let p = keys[j];
                    let pp = m.schema.paths[p];
                    if (pp._index !== null) {
                        // pp._index.Name = p;
                        // index.push(pp._index);
                        // index.push(pp.path);
                        index.push(pp);
                    }

                    if (pp.schema && pp.schema.paths) {
                        CheckFields(pp);
                    }

                    // 同一个数据库表中，字段不能重复，除了数组（）。
                    if (allFields.indexOf(pp.path) >= 0 &&
                        allFields.indexOf(pp.path) !== allFields.lastIndexOf(pp.path) &&
                        pp.path !== '_id' &&
                        m.instance !== 'Array') {
                        throw '数据表' + m.modelName + '存在重复的字段名' + pp.path;
                    }
                    else {
                        allFields.push(pp.path);
                    }
                }

                // custimized indexes
                if (m.schema._indexes) {
                    for (let j = 0; j < m.schema._indexes.length; j += 1) {
                        const _ind = m.schema._indexes[j];

                        if (_ind && Array.isArray(_ind) && _ind[0]) {
                            index.push({
                                path: _ind[0],
                                _index: _ind[1] || {}
                            });
                        }
                    }
                }
            };

            CheckFields(model);

            if (!index || index.length <= 0) continue;

            // 获取数据库实际所有的索引
            let rIndex = 0;
            try {
                rIndex = await ((model.collection).indexes());
            } catch (e) {
                app.logger.error(e.stack);
            }
            if (!rIndex || rIndex.length < 0) continue;

            for (let j = 0; j < rIndex.length; j += 1) {
                // TODO: 假设索引中只有一个key，目前没问题，但以后有风险！
                // const key = Object.keys(rIndex[j].key)[0];
                // if (key === '_id') continue;
                // const index_ind = index.findIndex((pp) => { return pp.path === key; });
                // if (index_ind >= 0) {
                //     index.splice(index_ind, 1);
                //     continue;
                // }

                const keys = Object.keys(rIndex[j].key);
                if (keys && keys.length === 1 && keys[0] === '_id') continue;
                const index_ind = index.findIndex((pp) => {
                    if (typeof pp.path === 'string' && keys.length === 1) {
                        return pp.path === keys[0];
                    } else if (typeof pp.path === 'object' && keys.length > 1) {
                        const defKeys = Object.keys(pp.path);
                        const dupKeys = [];
                        for (let k = 0; k < keys.length; k += 1) {
                            const key = keys[k];

                            if (defKeys.indexOf(key) >= 0) {
                                dupKeys.push(key);
                            }
                        }

                        if (defKeys.length === dupKeys.length) {
                            return true;
                        }
                        return false;
                    } else {
                        return false;
                    }
                });
                if (index_ind >= 0) {
                    index.splice(index_ind, 1);
                    continue;
                }

                // 删除已经不存在的index
                await model.collection.dropIndex(rIndex[j].name);
            }

            // 到这里，如果index列表里还有，说明需要添加新index，但不能自动添加，因为生产环境会影响性能。提示去手动添加。
            if (index.length > 0) {
                // 如果系统设置允许自动创建索引，则自动创建，否则报错提醒开发人员手动创建
                if (config.autoCreateIndexes) {
                    // 如果配置允许自动创建索引，则建立数据库连接时即可配置自动创建，而不需要这里人为创建
                    // app.logger.warn(`自动创建索引：${model.collection.name}: ${index.map(idx => JSON.stringify(idx.path))}`);
                    // model.createIndexes();
                } else {
                    errorMsg = errorMsg || (model.modelName + ' 需要手动创建索引: \n');
                    for (let k = 0; k < index.length; ++k) {
                        const ind = index[k];
                        errorMsg += 'db.' + model.collection.name + '.createIndex(' + (typeof ind.path === 'string' ? `{'${ind.path}': 1}` : JSON.stringify(ind.path)) + ', {unique: ' + !!ind._index.unique + ', sparse: ' + !!ind._index.sparse + '})\n';
                    }
                }
            }
        }

        if (errorMsg) {
            app.logger.error(errorMsg);
            process.exit(-1);
        }
    };

    db.on('error', (err) => {
        app.logger.error('连接数据库失败!! ' + err);
    });
    db.once('open', async () => {
        app.logger.info('开始整理数据库……');

        // let Config = await SystemConfig.findOne({});

        // if (!Config) {
        //     // 还没有系统配置
        //     Config = await SystemConfig.create({
        //         Version: '0.0.1'
        //     });
        // }

        try {
            app.logger.info('重建数据库索引……');
            await db.validateSchema();
            app.logger.info('重建数据库索引成功！');

            // if (Config.Version !== app.ctx.version) {
            //     app.logger.info('运行数据库升级脚本……');
            //     const uScripts = Scripts.Upgrade || [];
            //     for (let i = 0; i < uScripts.length; i += 1) {
            //         let s = uScripts[i].name;

            //         // 判断获取的脚本是否适合在当前版本中运行
            //         if (s.indexOf('U') !== 0) continue;
            //         s = s.substr(1);

            //         if (s.indexOf('_') < 0) continue;
            //         s = s.split('_');

            //         if (s.length < 2) continue;
            //         const from = Number(s[0]);
            //         const to = Number(s[1]);

            //         if (!from || !to) continue;
            //         if (from < Config.Version) continue;
            //         if (to > app.ctx.version) continue;

            //         // 运行数据库升级脚本
            //         await uScripts[i]();
            //     }
            //     app.logger.info('运行数据库升级脚本成功！');
            // }
        }
        catch (e) {
            app.logger.error('整理数据库失败！\n' + e);
            process.exit(-1);
        }

        // // 更新当前版本到配置文件
        // if (Config.Version !== app.ctx.version) {
        //     Config.Version = app.ctx.version;
        //     await Config.save();
        // }

        app.db.__ready = true;
        app.logger.info('连接数据库成功!');
    });

    /**
     * * Init database tables (collections) schemas according to the definition in the module
     * * or use a schema specified in the function parameter
     */
    db.initModuleSchema = function (app, mdl, s) {
        mdl.data = mdl.data || {};
        const schemas = s || mdl.data;

        mdl.models = mdl.models || {};
        app.models = app.models || {};

        Object.keys(schemas).forEach(k => {
            if (app.models[k] && typeof app.models[k] === 'function') {
                // already exists
                app.logger.error(`Module '${mdl.name}' : DB model ${k} is already exists!`)
                return;
            }
            // get the schema definition of each collection
            let d = schemas[k];
            if (!d) return;

            // add default fields if not exist yet
            d['LastUpdateDate'] || (d['LastUpdateDate'] = { type: "Date", index: true });
            d['CreatedDate'] || (d['CreatedDate'] = { type: "Date", index: true });
            d['id'] = {
                type: "String",
                unique: true,
                default: function () {
                    return this._id.toString();
                },
                // set: function () {
                //     return this._id.toString();
                // }
            };
            d['Saved'] || (d['Saved'] = { type: "Boolean" });
            d['Deleted'] || (d['Deleted'] = { type: "Boolean", default: false });

            // change the data type according to the string
            function processFieldSchema (d) {
                Object.keys(d).forEach(dk => {
                    if (d[dk] && d[dk].type && typeof d[dk].type === 'string') {
                        switch (d[dk].type.toLowerCase()) {
                            case 'string':
                                d[dk].type = String;
                                break;
                            case 'boolean':
                                d[dk].type = Boolean;
                                break;
                            case 'date':
                                d[dk].type = Date;
                                break;
                            case 'id':
                                // no mongoose objectid, always use String
                                d[dk].type = String;
                                break;
                            case 'number':
                                d[dk].type = Number;
                                break;
                            case 'array':
                                // d[dk].type = Array;
                                d[dk].type = mongoose.Schema.Types.Mixed;
                                break;
                            case 'object':
                                d[dk].type = mongoose.Schema.Types.Mixed;
                                break;
                        }

                        if (d[dk].refer) {
                            d[dk].ref = d[dk].refer;
                        }
                    } else if (Array.isArray(d[dk])) {
                        // is an array
                        if (dk === '__Indexes' || dk === '__Virtuals') {
                            //
                        } else {
                            d[dk].forEach(da => processFieldSchema(da));
                        }
                    } else if (typeof d[dk] === 'object') {
                        // nested object
                        Object.keys(d[dk]).forEach(ndk => {
                            processFieldSchema(d[dk][ndk]);
                        })
                    }
                })
            }

            processFieldSchema(d);

            // merge fields if we already have such collection from other modules
            Object.keys(app.models).forEach(mk => {
                const appModel = app.models[mk];
                if (appModel.modelShortName === k) {
                    d = Object.merge(d, appModel.schemaDefinition);
                }
            })

            // extend with the extend schema defined in config
            if (config && config.extendSchema) {
                const extendDef = config.extendSchema[k];

                if (extendDef) {
                    d = Object.assign(d, extendDef)
                }
            }

            const model = {};
            model.modelShortName = k;
            model.schemaDefinition = d;

            // attach the model to the module instance.
            mdl.models[k] = model;

            // attach the model to the application.
            app.models[k] = model;
        });
    };

    /**
     * After get all the model schema ready, we use this function to create the data models.
     * All the data models will stored in app.models, and only the data models defined in a module will be stored in the module.models.
     */
    db.initModuleModel = function (app, mdl, mList) {
        const modelList = mList || mdl.models;
        let forceDate;

        if (mdl && mdl.config && typeof mdl.config.forceDate === 'boolean') {
            forceDate = mdl.config.forceDate;
        } else {
            forceDate = config.forceDate;
        }

        Object.keys(modelList).forEach(mk => {
            const model = app.models[mk];
            if (model.modelName) {
                // this model was created already.
                mdl.models[mk] = model;
            } else {
                // not created yet
                // generate the db model
                const schemaName = `${mk}Schema`;
                const schemaObject = {};

                // indexes
                let INDEXES = model.schemaDefinition.__Indexes;
                if (INDEXES && Array.isArray(INDEXES)) {
                    delete model.schemaDefinition.__Indexes;
                }
                INDEXES = INDEXES || [];

                // virtuals
                let VIRTUALS = model.schemaDefinition.__Virtuals;
                if (VIRTUALS && Array.isArray(VIRTUALS)) {
                    delete model.schemaDefinition.__Virtuals;
                }
                VIRTUALS = VIRTUALS || [];

                // disable the minimize option, so we can save empty objects, like Permission for account etc.
                schemaObject[schemaName] = new mongoose.Schema(model.schemaDefinition, { __v: false, minimize: false });

                // indexes
                for (let i = 0; i < INDEXES.length; i += 1) {
                    const ind = INDEXES[i];

                    if (ind && ind.def) {
                        schemaObject[schemaName].index(ind.def, ind.set || {});
                    }
                }

                // virtuals
                for (let i = 0; i < VIRTUALS.length; i += 1) {
                    const virt = VIRTUALS[i];

                    if (virt && virt.name) {
                        schemaObject[schemaName].virtual(virt.name).get(virt.get || (() => { })).set(virt.set || (() => { }));
                    }
                }

                schemaObject[schemaName].plugin(mongoosePaginate);
                schemaObject[schemaName].plugin(beautifyUnique, {
                    defaultMessage: config.defaultBeautifyUniqueMessage || 'The field is not unique!'
                });

                /**
                 * 在更新数据文档时自动设置LastUpdateDate到当前的时间，这样其他代码中就不需要再特别设置此数据。
                 */
                schemaObject[schemaName].pre("save", function (next) {
                    if (forceDate || !this.LastUpdateDate)
                        this.LastUpdateDate = new Date();

                    if (this.isNew && (forceDate || !this.CreatedDate))
                        this.CreatedDate = new Date();

                    if (!this.isNew)
                        this.Saved = true;

                    return next();
                });
                schemaObject[schemaName].pre("update", function (next) {
                    if (forceDate || !this.LastUpdateDate)
                        this.LastUpdateDate = new Date();

                    this.Saved = true;

                    return next();
                });
                schemaObject[schemaName].pre("updateOne", function (next) {
                    if (forceDate || !this.LastUpdateDate)
                        this.LastUpdateDate = new Date();

                    this.Saved = true;

                    return next();
                });
                schemaObject[schemaName].pre("updateMany", function (next) {
                    if (forceDate || !this.LastUpdateDate)
                        this.LastUpdateDate = new Date();

                    this.Saved = true;

                    return next();
                });

                schemaObject[schemaName].pre("create", function (next) {
                    if (forceDate || !this.CreatedDate)
                        this.CreatedDate = new Date();

                    if (forceDate || !this.LastUpdateDate)
                        this.LastUpdateDate = new Date();

                    return next();
                });

                // customized hooks
                const cusHooks = model.hooks || (app.__modelHooks && app.__modelHooks[mk]) || [];
                cusHooks.forEach(hook => {
                    if(!hook || !hook.hook || !hook.method || !hook.func) return;

                    if(hook.hook === 'post') {
                        schemaObject[schemaName].post(hook.method, hook.options, hook.func);
                    } else if(hook.hook === 'pre') {
                        schemaObject[schemaName].pre(hook.method, hook.options, hook.func);
                    }
                });

                // const newModel = mongoose.model(`${mdl.name}_${mk}`, schemaObject[schemaName]);
                const newModel = mongoose.model(mk, schemaObject[schemaName]);

                Object.assign(newModel, model);

                // attach the model to module
                mdl.models[mk] = newModel;

                // attach the model to the app
                app.models[mk] = newModel;
            }
        })
    };

    async function _dataProcessMiddleware (req, res, next) {
        if (!res.locals.CURD || res.locals.CURD.length <= 0) return next();
        if (res.locals.err) return next();

        const mongooseDbHelper = require('./dbhelper')(app);

        for (let i = 0; i < res.locals.CURD.length; i += 1) {
            if (res.locals.cancel) break;

            const op = res.locals.CURD[i];

            if (op.model) {
                // restore the context
                res.locals.filter = op.ctx.filter;
                res.locals.options = op.ctx.options;
                res.locals.fields = op.ctx.fields;
                res.locals.body = op.ctx.body;
                res.locals.doc = op.ctx.doc;

                // do the real db operations according to the given method
                // TODO: add transaction
                switch (op.method.toLowerCase()) {
                    case 'r':
                        await mongooseDbHelper.FindDocuments(op.model)(req, res);
                        break;
                    case 'ra':
                        await mongooseDbHelper.FindAllDocuments(op.model)(req, res);
                        break;
                    case 'c':
                        await mongooseDbHelper.CreateDocument(op.model)(req, res);
                        break;
                    case 'u':
                        await mongooseDbHelper.UpdateDocument(op.model)(req, res);
                        break;
                    case 'd':
                        await mongooseDbHelper.DeleteDocument(op.model)(req, res);
                        break;
                    case 'a':
                        await mongooseDbHelper.Aggregate(op.model)(req, res);
                        break;
                    default:
                        break;
                }
            }

            // call callbacks in order
            for (let j = 0; j < op.cbs.length; j += 1) {
                await op.cbs[j](req, res, op);
            }
        }

        if (!res.locals.NONEXT)
            return next();
    }

    db.dataProcessMiddleware = _dataProcessMiddleware;

    /**
     * Replace the default express.Router funtion so that we can attach all the db helper function to the router instance.
     * And after this we can use these db helpers from middleware.
     */
    const curdFunc = (method = 'R') => {
        return (model, overwrite = true, callback) => {
            return (req, res, next) => {
                if(res.locals.__cancelOnce || res.locals.cancel) {
                    return next && next();
                }

                res.locals = res.locals || {};
                res.locals.body = res.locals.body || {};
                res.locals.doc = res.locals.doc || {};
                res.locals.CURD = res.locals.CURD || [];

                const existOp = res.locals.CURD.find(m => m.method === method && m.model === model)
                if (res.locals.CURD.length <= 0 || !overwrite || !existOp) {
                    const filter = Object.assign({}, res.locals.filter);
                    const options = res.locals.options ? res.locals.options : Object.assign({}, res.locals.options);
                    const fields = Object.assign([], res.locals.fields);
                    const body = Object.assign({}, res.locals.body);
                    const doc = Object.assign({}, res.locals.doc);
                    res.locals.CURD.push({
                        method: method,
                        model: model,
                        ctx: {
                            filter: filter,
                            options: options,
                            fields: fields,
                            body: body,
                            doc: doc
                        },
                        cbs: callback ? [callback] : []
                    });
                } else {
                    // merge ctx
                    Object.merge(existOp.ctx, {
                        filter: res.locals.filter,
                        options: res.locals.options,
                        body: res.locals.body,
                        doc: res.locals.doc
                    })

                    // fields
                    if (res.locals.fields && Array.isArray(res.locals.fields) && res.locals.fields.length > 0) {
                        if (!existOp.ctx.fields || !Array.isArray(existOp.ctx.fields)) {
                            existOp.ctx.fields = res.locals.fields;
                        } else {
                            for (let i = 0; i < res.locals.fields.length; i += 1) {
                                const nField = res.locals.fields[i];
                                if (existOp.ctx.fields.indexOf(nField) < 0) {
                                    existOp.ctx.fields.push(nField);
                                }
                            }
                        }
                    }

                    // callback
                    if (callback && typeof callback === 'function') {
                        existOp.cbs = existOp.cbs || [];
                        existOp.cbs.push(callback);
                    }
                }

                if (next)
                    return next();
            }
        };
    }

    const _expressRouter = express.Router;
    express.Router = function () {
        let router = _expressRouter();

        router.FindDocuments = curdFunc('R')
        router.FindAllDocuments = curdFunc('RA')
        router.CreateDocument = curdFunc('C')
        router.UpdateDocument = curdFunc('U')
        router.DeleteDocument = curdFunc('D')
        router.Aggregate = curdFunc('A')

        return router;
    };

    // attach the db operations to app
    app.FindDocuments = curdFunc('R')
    app.FindAllDocuments = curdFunc('RA')
    app.CreateDocument = curdFunc('C')
    app.UpdateDocument = curdFunc('U')
    app.DeleteDocument = curdFunc('D')
    app.Aggregate = curdFunc('A')

    return db;
};
