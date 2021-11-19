module.exports = {
    /**
     * Mongoose aggregate方法中使用的保留小数位数。
     *
     * 不能使用在$group中，可以在$group后面添加$addFields并使用此方法。
     *
     * @param value 需要处理的输入
     * @param num 保留的小数位数，不指定时默认为2
     * @returns {{$divide: *[]}}
     * @constructor
     */
    Aggregate_Round: function (value, num = undefined) {
        const p = Math.pow(10, num || 2);
        return {
            $divide: [
                {
                    $floor: {
                        $add: [
                            {
                                $multiply: [
                                    value,
                                    p
                                ]
                            },
                            0.49999999999999
                        ]
                    }
                },
                p
            ]
        };
    },
    MergeQueryFilter: (...filters) => {
        if(!filters || !Array.isArray(filters) || filters.length <= 0) return {};

        const ret = {};
        for (let i = 0; i < filters.length; i += 1) {
            const filter = filters[i];
        
            for (let j = 0; j < Object.keys(filter).length; j += 1) {
                const fk = Object.keys(filter)[j];
            
                if(fk === '$and') {
                    if(ret.$and) {
                        ret.$and = ret.$and.concat(filter[fk]);
                    } else {
                        ret.$and = filter[fk];
                    }
                } else if (fk === '$or') {
                    if (ret.$and) {
                        ret.$and = ret.$and.push({$or: filter[fk]});
                    } else {
                        ret.$and = [{ $or: filter[fk] }];
                    }
                } else {
                    ret[fk] = filter[fk];
                }
            }
        }

        return ret;
    }
}