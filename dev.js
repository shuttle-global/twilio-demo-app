const express = require('express');
const demo_app = require('./index.js');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let requestCount = 0;

function log(context, severity, message) {
    console.log(JSON.stringify({"when": new Date(), context: context.id, severity, message}));
}

app.use((req, res, next) => {
    req.c = {id: requestCount++, start: new Date(), log, };

    req.c.log(req.c, "debug", {
        "type": "request",
        "action": "start",
        "method": req.method,
        "host": req.headers['Host'],
        "path": req.url,
        "from_ip": req.headers["X-Forwarded-For"] || req.ip,
        "bytes_in": req.headers["content-length"] ? parseInt(req.headers["content-length"]) : undefined,
        "body": (req.method == "POST" || req.method == "PUT") ? req.rawBody || req.body : undefined,
    });

    res.on('finish', (data) => {
        if (res.statusCode != 500) {
            const logSeverity = (res.statusCode >= 200 && res.statusCode <= 399 ? "debug" : "warn")

            req.c.log(req.c, "debug", {
                "type": "request",
                "action": "complete" || (res.statusCode >= 200 && res.statusCode <= 399 ? "" : "_error"),
                "status": res.statusCode,
                "method": req.method,
                "host": req.headers['Host'],
                "path": req.originalUrl,
                "redirect": res.statusCode == 302 ? res.get('location') : undefined,
                "bytes_in": req.headers["content-length"] ? parseInt(req.headers["content-length"]) : undefined,
                "bytes_out": res.getHeaders()["content-length"] ? parseInt(res.getHeaders()["content-length"]) : undefined,
                "duration": (new Date().getTime() - req.c.start.getTime())
            });
        }
    })

    next();
});

demo_app.mount(app);

app.use((error, req, res, next) => {
	if (res.headersSent) {
		next(error);
		return;
	}

	if (error.status == 401) {
	    res.status(401).send({error: "Unauthorized"});
	} else {
	    res.status(500).send({error: error.message || error.body || error});
	}

    req.c.log(req.c, "error", {
        "type": "request",
        "action": "complete_error",
        "status": res.statusCode,
        "method": req.method,
        "host": req.headers['Host'],
        "path": req.originalUrl,
        "error": error.message,
        "stack": error.stack,
        "duration": (new Date().getTime() - req.c?.start.getTime())
    });
});



app.listen(3000, () => console.log(`Listening on: 3000`));
