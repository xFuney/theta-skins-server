# Statistics API

This is documentation for the Statistics API.

## GET /statistics/api/skins

### Parameters
**No parameters**

### Returns
JSON string containing amount of skins cached, amount of skins overridden, epoch timestamp of previous skin cache wipe, epoch timestamp of next skin cache wipe.

### Sample Resoponse
**MIME Type:** application/json

```json
{"cached":0,"overridden":0,"cache_wipe_time":1610029624092,"previous_cache_wipe_time":1609943224092}
```

## GET /statistics/api/capes

### Parameters
**No parameters**

### Returns
JSON string containing amount of capes cached, amount of capes overridden, epoch timestamp of previous cape cache wipe, epoch timestamp of next cape cache wipe.

### Sample Resoponse
**MIME Type:** application/json

```json
{"cached":0,"overridden":0,"cache_wipe_time":1610116024092,"previous_cache_wipe_time":1609943224092}
```

## GET /statistics/api/java

### Parameters
**No parameters**

### Returns
JSON string containing versions of Java that have connected to this skins server (has count of each time).

### Sample Response
**MIME Type:** application/json

```json
{"Java/1.8.0_74":1}
```