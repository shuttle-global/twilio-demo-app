const express = require('express');
const node_fetch = require('node-fetch');
const FormData = require('form-data');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const config = {
    SANDBOX_SHARED_KEY: "1186_681287",
    LIVE_SHARED_KEY: "1186_681286",
    TWILIO_SID: process.env.TWILIO_SID,
    TWILIO_TOKEN: process.env.TWILIO_TOKEN,
    TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM
}

function twilio_public_key(instance) {
    return instance.startsWith("T_") ? config.SANDBOX_SHARED_KEY : config.LIVE_SHARED_KEY;
}

function app_path (context, path) {
    return `/demo/${context.connector}/${context.instance_id}/${context.instance_secret}${path}`   
}

const shuttle_api = {
    host: process.env.TWILIO_API_URL || 'https://twilio.shuttleglobal.com',

    // Wrap fetch with logging
    _logged_fetch: (context, url, options) => {
        var start = new Date().getTime();
        context.log(context, "debug", {"type": "fetch", "action": "start", url, options});
        
        return node_fetch(url, options)
            .then(async (response) => {
                var ok = response.status >= 200 && response.status < 400
                var json = options.method != "DELETE" ? await response.json() : undefined;
                
                context.log(context, ok ? "debug" : "error", {"type": "fetch", "action": ok ? "complete" : "complete_error", url, status: response.status, body: json, duration: new Date().getTime() - start});
                
                if (ok) {
                    return json;
                } else {
                    return;
                }
            });
    },

    fetch: (context, path, options) => {
        return shuttle_api._logged_fetch(context, `${shuttle_api.host}${path}`, {
            headers: {
                ...options?.headers,
                "Authorization": "Bearer " + context.instance_secret,
                "Content-Type": options?.json ? "application/json" : (options?.headers || {})["Content-Type"]
            },
            body: options?.json ? JSON.stringify(options?.json) : options?.body,
            ...options,
        })
    },

    get_instance: (context) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}`)
            .then((response) => response?.instance);
    },

    get_capabilities: (context) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/capabilities`)
            .then((response) => response?.capabilities);
    },

    get_payment_methods: (context, crm_key) => {
        // return crm_key ? shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payment_methods?criteria=${escape(`account=${acc_20648_10016 || crm_key}`)}`)
        return crm_key ? shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/accounts/${crm_key}/payment_methods?criteria=${escape(`status=ACTIVE;FAILING`)}`)
            .then((response) => response?.payment_methods) : undefined;
    },  

    get_payment_method: (context, payment_method_id) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payment_methods/${payment_method_id}`)
            .then((response) => response?.payment_method);
    },


    get_payment: (context, payment_id) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payments/${payment_id}`)
            .then((response) => response?.payment);
    },  

    create_payment: (context, body) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payments`, {
            method: "POST",
            json: body
        });
    },  

    create_checkout: (context, body) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/checkout`, {
            method: "POST",
            json: body
        });
    },  

    refund_payment: (context, payment_id, amount, reason) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payments/${payment_id}/refund`, {
            method: "POST",
            json: {
                amount: amount,
                reason: reason || "Test App"
            }
        }).then((response) => response?.refund);
    },   

    capture_payment: (context, payment_id, amount) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payments/${payment_id}/capture`, {
            method: "POST",
            json: {
                amount: amount
            }
        }).then((response) => response?.capture);
    },   

    void_payment: (context, payment_id) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payments/${payment_id}/void`, {
            method: "POST",
        }).then((response) => response?.void);
    },

    delete_payment_method: (context, payment_method_id) => {
        return shuttle_api.fetch(context, `/c/api/instances/${context.instance_id}/payment_methods/${payment_method_id}`, {
            method: "DELETE"
        }).then((response) => response);
    },

    send_sms: (context, from, to, message) => {
        let form = new FormData();
        form.append('From', from);
        form.append('To', to);
        form.append('Body', message);

        return shuttle_api._logged_fetch(context, `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_SID}/Messages.json`, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${Buffer.from(config.TWILIO_SID + ":" + config.TWILIO_TOKEN).toString('base64')}`,
            },
            body: form
        });

    }
}

function mount (app) {
    // A little wrapper function to ensure errors get cause by express catch-all error handler
    function handle_async_errors (fn) {
        return (req, res, next) => {
            return fn(req, res, next).catch((e) => next(e));
        }
    };

    app.get('/demo/link/:instance_id/:link', (req, res) => {
        res.status(200).send(
            `<!DOCTYPE html>
            <html class="h-full">
              <head>
                <meta charset="utf-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <title>Demo Payment</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="icon" href="/favicon.png">
              </head>
              <body>
                <div data-shuttle-checkout="${req.params.link}" data-shuttle-disable-new-window="true" data-shuttle-host="https://app.shuttleglobal.com"></div>
                <script src="https://app.shuttleglobal.com/${twilio_public_key(req.params.instance_id)}/${req.params.instance_id}/shuttle-1.3.X.js" type="text/javascript"></script>
              </body>
            </html>`);
    })

    app.use('/demo/:connector/:instance_id/:instance_secret', (req, res, next) => {
        req.c = req.c;
        req.c.connector = req.params.connector;
        req.c.instance_id = req.params.instance_id;
        req.c.instance_secret = req.params.instance_secret;
        req.c.instance_promise = shuttle_api.get_instance(req.c);
        req.c.capabilities_promise = shuttle_api.get_capabilities(req.c);
        req.c.account_phone = req.body.Caller?.replace(/\+/, "");
        req.c.account_crm_key = req.c.account_phone ? "DEMO_" + req.c.account_phone : undefined; // Use your customer ID
        req.c.payment_methods_promise = req.c.account_crm_key ? shuttle_api.get_payment_methods(req.c, req.c.account_crm_key) : undefined;

        next();
    })

    app.use('/demo/:connector/:instance_id/:instance_secret/payment/:payment_id', (req, res, next) => {
        req.c.payment_id = req.params.payment_id;
        req.c.payment_promise = shuttle_api.get_payment(req.c, req.c.payment_id);

        next();
    })    

    app.use('/demo/:connector/:instance_id/:instance_secret/payment_method/:payment_method_id', (req, res, next) => {
        req.c.payment_method_id = req.params.payment_method_id;
        req.c.payment_method_promise = shuttle_api.get_payment_method(req.c, req.c.payment_method_id);

        next();
    })    

    app.all('/demo/:connector/:instance_id/:instance_secret/start', handle_async_errors(async (req, res, next) => {
        if (req.method == "GET") {
            // We need phone number, convert to POST
            const twiml = new VoiceResponse();
            twiml.redirect(app_path(req.c, `/start`));
            res.type('text/xml');
            res.send(twiml.toString());  
            return;
        }

        const instance = await req.c.instance_promise;
        const capabilities = await req.c.capabilities_promise;
        const twiml = new VoiceResponse();

        if (instance && capabilities?.payments_ready) {
            const gather = twiml.gather({numDigits: 1, action: app_path(req.c, `/main_menu`)});
            gather.say(`Welcome to the Shuttle phone payments demo for ${instance.name}.`);
            
            if (instance.environment == "SANDBOX") {
                gather.say(`This is a TEST environment and requires the use of TEST card numbers.`);
            } else {
                gather.say(`This is a LIVE environment, processing REAL payments.`);
            }

            gather.say("Main menu");
            var menu = await build_main_menu(req.c);
            menu.map((item, index) => gather.say(`${index + 1} ${item.name}`));
        } else if (instance) {
            twiml.say(`Welcome to the Shuttle phone payments demo for ${instance.name}.`);
            twiml.say(`You've not yet configured your gateway, please visit twilio.shuttleglobal.com and then try again.`);
        } else {
            twiml.say(`Welcome to the Shuttle phone payments demo. The Twilio call webhook URL was incorrect, please check it and try again.`);
        }

        res.type('text/xml');
        res.send(twiml.toString());  
    }));

    async function build_main_menu(context, choices_so_far = []) {
        const capabilities = await context.capabilities_promise;
        const payment_methods = await context.payment_methods_promise || [];

        let menu = [
            {
                name: "for a new payment",
                sub_menu: [
                    {
                        name: "for card",
                        enabled: !!capabilities.payment_method_types_moto.VISA?.features.filter((f) => f == "PAYMENT").length,
                        redirect: app_path(context, `/new_payment?type=CARD`)
                    },
                    {
                        name: "for ACH",
                        enabled: !!capabilities.payment_method_types_moto.ACH?.features.filter((f) => f == "PAYMENT").length,
                        sub_menu: [
                            {
                                name: "to use a consumer checking account",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=consumer-checking`)
                            },
                            {
                                name: "to use a consumer savings account",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=consumer-savings`)
                            },
                            {
                                name: "to use a commercial checking account",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=commercial-checking`)
                            }
                        ]
                    },
                    {
                        name: "to use a previously saved payment method",
                        enabled: payment_methods.length,
                        sub_menu: payment_methods.map((pm) => ({
                            name: "for " + pm.name,
                            redirect: app_path(context, `/repeat_payment?payment_method=${pm.id}`)
                        }))
                    },
                    {
                        name: "to be send a payment link and complete on your phone",
                        enabled: !!Object.keys(capabilities.payment_method_types_moto).filter((type) => capabilities.payment_method_types_moto[type].features.filter((f) => f == "PAYMENT").length).length,
                        redirect: app_path(context, `/payment_link`)
                    }
                ]
            },
            {
                name: "for a new authorisation",
                sub_menu: [
                    {
                        name: "for card",
                        enabled: !!capabilities.payment_method_types_moto.VISA?.features.filter((f) => f == "AUTHORISE").length,
                        redirect: app_path(context, `/new_payment?type=CARD&action=AUTH`)
                    },
                    {
                        name: "to use a previously saved payment method",
                        enabled: payment_methods.length,
                        sub_menu: payment_methods.map((pm) => ({
                            name: "for " + pm.name,
                            redirect: app_path(context, `/repeat_payment?payment_method=${pm.id}&action=AUTH`)
                        }))
                    },
                    {
                        name: "to be send a payment link and complete on your phone",
                        enabled: !!Object.keys(capabilities.payment_method_types_moto).filter((type) => capabilities.payment_method_types_moto[type].features.filter((f) => f == "AUTHORISE").length).length,
                        redirect: app_path(context, `/payment_link?action=AUTH`)
                    }
                ]
            },
            {
                name: "for a new payment with tokenisation",
                sub_menu: [{
                        name: "for card",
                        enabled: !!capabilities.payment_method_types_moto.VISA?.features.filter((f) => f == "PAYMENT_AND_SAVE_TOKEN").length,
                        redirect: app_path(context, `/new_payment?type=CARD&save=Y`)
                    },
                    {
                        name: "for ACH",
                        enabled: !!capabilities.payment_method_types_moto.ACH?.features.filter((f) => f == "PAYMENT_AND_SAVE_TOKEN").length,
                        sub_menu: [
                            {
                                name: "for consumer checking",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=consumer-checking&save=Y`)
                            },
                            {
                                name: "for consumer savings",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=consumer-savings&save=Y`)
                            },
                            {
                                name: "for commercial checking",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=commercial-checking&save=Y`)
                            }
                        ]
                    },
                    {
                        name: "to be send a payment link and complete on your phone",
                        enabled: !!Object.keys(capabilities.payment_method_types_moto).filter((type) => capabilities.payment_method_types_moto[type].features.filter((f) => f == "PAYMENT_AND_SAVE_TOKEN").length).length,
                        redirect: app_path(context, `/payment_link?save=Y`)
                    }
                ]
            },
            {
                name: "to tokenise a payment method",
                sub_menu: [
                    {
                        name: "for card",
                        enabled: !!capabilities.payment_method_types_moto.VISA?.features.filter((f) => f == "SAVE_CARD").length,
                        redirect: app_path(context, `/new_payment?type=CARD&action=TOKENISE`)
                    },
                    {
                        name: "for ACH",
                        enabled: !!capabilities.payment_method_types_moto.ACH?.features.filter((f) => f == "SAVE_CARD").length,
                        sub_menu: [
                            {
                                name: "to use a consumer checking account",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=consumer-checking&action=TOKENISE`)
                            },
                            {
                                name: "to use a consumer savings account",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=consumer-savings&action=TOKENISE`)
                            },
                            {
                                name: "to use a commercial checking account",
                                redirect: app_path(context, `/new_payment?type=ACH&account_type=commercial-checking&action=TOKENISE`)
                            }
                        ]
                    },
                    {
                        name: "to be send a payment link and complete on your phone",
                        enabled: !!Object.keys(capabilities.payment_method_types_moto).filter((type) => capabilities.payment_method_types_moto[type].features.filter((f) => f == "SAVE_CARD").length).length,
                        redirect: app_path(context, `/payment_link?action=TOKENISE`)
                    }
                ]
            },
            {
                name: "to delete a previously tokenised payment method",
                enabled: payment_methods.length, // not implemented
                sub_menu: payment_methods.map((pm) => ({
                    name: pm.name,
                    redirect: app_path(context, `/payment_method/${pm.id}/delete`)
                }))
            }
        ];


        // Get rid of !enabled nodes, and items with no enabled sub_menu options left or action
        var trimmed_menu = (menu) => {
            return menu?.filter((i) => i.enabled != false).map((i) => ({...i, sub_menu: trimmed_menu(i.sub_menu)})).filter((i) => i.enabled != false && (i.sub_menu || i.redirect));
        }

        menu = trimmed_menu(menu);

        // Invalid choice will throw an exception
        choices_so_far?.map((c) => { menu = menu[c].sub_menu});

        return menu;
    }

    app.post('/demo/:connector/:instance_id/:instance_secret/main_menu', handle_async_errors(async (req, res) => {
    	const twiml = new VoiceResponse();

        var choices_so_far = req.query.choice ? req.query.choice.split(",") : [];
        var menu;

        try {
            menu = await build_main_menu(req.c, choices_so_far);
            if (menu.length == 0) {
                throw "Invalid URL";
            }
        } catch(err) {
            twiml.say("Sorry, something went wrong."); 
            menu = await build_main_menu(req.c);   
            choices_so_far = [];      
        }
        
        const selection = req.body.Digits;

        if (selection == 0) {
            // Restart main Menu
            twiml.redirect(app_path(req.c, `/main_menu`));
        } else if (selection >= 0 && menu[selection - 1]?.redirect) {
            twiml.redirect(menu[selection -1].redirect);
        } else {
            if (selection >= 0) {
                if (menu[selection - 1]) {
                    if (menu[selection - 1].sub_menu) {
                        menu = menu[selection -1].sub_menu;
                        choices_so_far.push(selection -1);
                    } else {
                        twiml.say("Sorry, invalid menu config, every node must have a sub_menu or redirect");                
                    }
                } else {
                    twiml.say("Sorry, invalid selection");                
                } 
            }

            const gather = twiml.gather({numDigits: 1, action: app_path(req.c, `/main_menu?choice=${choices_so_far?.join(",") || ""}`)});
            gather.say("Press");
            menu.map((item, index) => gather.say(`${index + 1} ${item.name}`));
        }
              
		res.type('text/xml');
		res.send(twiml.toString());  
    }));

    app.post('/demo/:connector/:instance_id/:instance_secret/new_payment', handle_async_errors(async (req, res) => {
    	const twiml = new VoiceResponse();

        if (req.query.action == "TOKENISE") {
            twiml.say(`You are going to save a payment method for reuse`);
        } else {
            twiml.say(`You are going to ${req.query.action == "AUTH" ? "authorize" : "pay"} 1 USD ${req.query.save == "Y" ? "and save the payment method for reuse" : ""} `);            
        }

        const pay = twiml.pay({
            paymentConnector: req.c.connector,
            chargeAmount: req.query.action != "TOKENISE" ? 1 : undefined,
            postalCode: req.body.FromCountry === "US",
            paymentMethod: req.query.type == "ACH" ? 'ach-debit' : undefined,
            bankAccountType: req.query.account_type,
            action: app_path(req.c, `/payment_response`),
            description: `Demo App - ${req.query.type} ${req.query.action || "payment"}`
        });

        if (req.body.Caller) {
            pay.parameter({name: "account_crm_key", value: req.c.account_crm_key});
            pay.parameter({name: "account_phone", value: req.c.account_phone});                
        }

        if (req.query.action == "AUTH") {
            pay.parameter({name: "action", value: "AUTH"});
        }
        if (req.query.save == "Y") {
            pay.parameter({name: "save_card", value: true});
        }
    
        let prompt = pay.prompt({for: "payment-processing"});
        prompt.say("Please wait while we process your payment, this may take a few seconds.")

		res.type('text/xml');
		res.send(twiml.toString());        
    }));

    app.post('/demo/:connector/:instance_id/:instance_secret/payment_response', handle_async_errors(async (req, res) => {
    	const twiml = new VoiceResponse();

        if (req.body.PaymentConfirmationCode) {
            twiml.redirect(app_path(req.c, `/payment/${req.body.PaymentConfirmationCode}`));            
        } else if (req.body.PaymentToken) {
            twiml.redirect(app_path(req.c, `/payment_method/${req.body.PaymentToken}`));            
        } else {
            twiml.say(`Sorry, there was an error, ${req.body.PaymentError}`);             
            twiml.redirect(app_path(req.c, `/main_menu`));
        }

		res.type('text/xml');
		res.send(twiml.toString());  
    }));

    app.post('/demo/:connector/:instance_id/:instance_secret/repeat_payment', handle_async_errors(async (req, res) => {
        const payment_methods = await req.c.payment_methods_promise;
        const twiml = new VoiceResponse();

        const payment_method = payment_methods.filter((pm) => pm.id == req.query.payment_method)[0];
        
        if (payment_method) {
            twiml.say(`You are going to ${req.query.action == "AUTH" ? "authorize" : "pay"} 1 USD using your ${payment_method.name}`);

            var response = await shuttle_api.create_payment(req.c, {
                payment: {
                    source: "MOTO",
                    action: req.query.action,
                    currency: "USD",
                    amount: "1",
                    description: `Demo App - Saved card ${req.query.action || "payment"}`,
                    payment_method: payment_method.id,
                    account: req.c.account_crm_key
                }
            });

            twiml.redirect(app_path(req.c, `/payment/${response.payment.id}`));            
        } else {
            twiml.say(`Invalid selection, returning to main menu`);
            twiml.redirect(app_path(req.c, `/main_menu`));
        }

        res.type('text/xml');
        res.send(twiml.toString());        
    }));    

    app.post('/demo/:connector/:instance_id/:instance_secret/payment_link', handle_async_errors(async (req, res) => {
        const twiml = new VoiceResponse();

        var link_id = `link-${new Date().getTime()}`; // basket 

        var response = await shuttle_api.create_checkout(req.c, {
            options: {
                instance_key: req.c.instance_id,
                action: req.query.action,
                alt_key: link_id,
                currency: "USD",
                amount: req.query.action != "TOKENISE" ? "1" : undefined,
                description: `Demo App - Payment link`,
                account: {
                    crm_key: req.c.account_crm_key
                },
                save_card: req.query.save == "Y" || undefined
            }
        });

        await shuttle_api.send_sms(req.c, config.TWILIO_SMS_FROM || req.body.Called, req.body.Caller, `Please complete your payment here: ${shuttle_api.host}/demo/link/${response.nonce}`);
        
        twiml.say(`We've sent you a link to ${req.query.action == "AUTH" ? "authorize" : "pay"} 1 USD, please follow the link to complete payment.`);
        twiml.redirect(app_path(req.c, `/payment_link/${link_id}/wait`));

        res.type('text/xml');
        res.send(twiml.toString());        
    }));        

    app.post('/demo/:connector/:instance_id/:instance_secret/payment_link/:link/wait', handle_async_errors(async (req, res) => {
        const twiml = new VoiceResponse();

        const gather = twiml.gather({numDigits: 1});

        var payment;
        try {
            payment = await shuttle_api.get_payment(req.c, req.params.link);
            if (payment.status == "UNRESOLVED") {
                // Still in progress
                payment = undefined;
            }
        } catch(err) {
            // Not Completed Yet
        }

        if (payment) {
            twiml.redirect(app_path(req.c, `/payment/${payment.id}`));
        } else if (req.body.Digits == 0) {
            twiml.redirect(app_path(req.c, `/main_menu`));
        } else {
            gather.say(`Press 1 when you've completed payment, or 0 to return to the main menu`);
            gather.pause({length: 7});
            twiml.redirect(app_path(req.c, `/payment_link/${req.params.link}/wait`));
        }
        res.type('text/xml');
        res.send(twiml.toString());        
    })); 

    app.post('/demo/:connector/:instance_id/:instance_secret/payment/:id', handle_async_errors(async (req, res) => {
        const payment = await req.c.payment_promise;
        const twiml = new VoiceResponse();

        if (payment.status =='SUCCESS' || payment.status =='UNATTRIBUTED') {
            twiml.say(`Your payment was Approved! Your reference is ${payment.reference}.`); 
            twiml.redirect(app_path(req.c, `/payment/${payment.id}/payment_menu`));            
        } else if (payment.status =='PENDING' || payment.status =='UNRESOLVED') {
            twiml.say(`Your payment is still processing, you should not dispatch any goods until the payment completes.`); 
            twiml.redirect(app_path(req.c, `/main_menu`));            
        } else if (payment.status =='DECLINED') {
            twiml.say(`Payment failed, with decline type ${payment.gateway_status}, reason: ${payment.gateway_reference}`); 
            twiml.redirect(app_path(req.c, `/main_menu`));            
        } else {
            twiml.say(`Sorry there was an error:  ${req.body.PaymentError}`);             
            twiml.redirect(app_path(req.c, `/main_menu`));            
        };

        res.type('text/xml');
        res.send(twiml.toString());  
    }));    

    app.post('/demo/:connector/:instance_id/:instance_secret/payment/:id/payment_menu', handle_async_errors(async (req, res) => {
        const capabilities = await req.c.capabilities_promise;
        const payment = await req.c.payment_promise;
        const twiml = new VoiceResponse();

        const gather = twiml.gather({numDigits: 1, action: app_path(req.c, `/payment/${payment.id}/payment_menu_response`)})
        
        gather.say("Payment Menu. Press  ");

        if (payment.balance > 0) { // check capabilities
            gather.say("1 to refund");
        }

        if (payment.authorised > 0) { // check capabilities
            gather.say("2 to capture the payment");
            gather.say("3 to void the authorisation");
        }

        gather.say("0 to return to the main menu");

        res.type('text/xml');
        res.send(twiml.toString());  
    }));    

    app.post('/demo/:connector/:instance_id/:instance_secret/payment/:id/payment_menu_response', handle_async_errors(async (req, res) => {
        const selection = req.body.Digits;
        const payment = await req.c.payment_promise;
        const twiml = new VoiceResponse();

        if (selection == 1) {
            // Refund
            var refund = await shuttle_api.refund_payment(req.c, req.c.payment_id)
            if (refund.status == 'SUCCESS') {
                twiml.say(`Payment refunded, reference ${refund.reference}.`);
                twiml.say("Returning to main menu.");
                twiml.redirect(app_path(req.c, `/main_menu`));            
            } else if (refund.status == 'PENDING' || refund.status == 'UNRESOLVED') {
                twiml.say(`Refund in progress, reference ${refund.reference}.`);
                twiml.say("Returning to main menu.");
                twiml.redirect(app_path(req.c, `/main_menu`));            
            } else {
                twiml.say(`Refund failed, reference ${refund.reference}`);
                twiml.redirect(app_path(req.c, `/payment/${req.params.id}/payment_menu`));            
            }
        } else if (selection == 2) {
            // Capture
            var capture = await shuttle_api.capture_payment(req.c, req.c.payment_id)
            if (capture.status == 'SUCCESS') {
                twiml.say(`Payment captures, reference ${capture.reference}.`);
                twiml.redirect(app_path(req.c, `/payment/${capture.id}/payment_menu`));            
            } else if (capture.status == 'PENDING' || capture.status == 'UNRESOLVED') {
                twiml.say(`Capture in progress, reference ${capture.reference}.`);
                twiml.say("Returning to main menu.");
                twiml.redirect(app_path(req.c, `/main_menu`));            
            } else {
                twiml.say(`Capture failed, reference ${capture.reference}`);
                twiml.redirect(app_path(req.c, `/payment/${req.params.id}/payment_menu`));            
            }
        } else if (selection == 3) {
            // Void
            var response = await shuttle_api.void_payment(req.c, req.c.payment_id)
            if (response.status == 'SUCCESS') {
                twiml.say(`Payment voided, reference ${response.reference}.`);
                twiml.redirect(app_path(req.c, `/main_menu`));            
            } else if (response.status == 'PENDING' || response.status == 'UNRESOLVED') {
                twiml.say(`Void in progress, reference ${response.reference}.`);
                twiml.say("Returning to main menu.");
                twiml.redirect(app_path(req.c, `/main_menu`));            
            } else {
                twiml.say(`Void failed, reference ${response.reference}`);
                twiml.redirect(app_path(req.c, `/payment/${req.params.id}/payment_menu`));            
            }
        } else if (selection == 0) {
            twiml.redirect(app_path(req.c, `/main_menu`));            
        }

        res.type('text/xml');
        res.send(twiml.toString());      
    }));

    app.post('/demo/:connector/:instance_id/:instance_secret/payment_method/:payment_method_id', handle_async_errors(async (req, res) => {
        const twiml = new VoiceResponse();
        const payment_method = await req.c.payment_method_promise;
                
        twiml.say(`You have saved your ${payment_method.name}`);
        twiml.say("Returning to main menu");
        twiml.redirect(app_path(req.c, `/main_menu`));

        res.type('text/xml');
        res.send(twiml.toString());        
    }));       

    app.post('/demo/:connector/:instance_id/:instance_secret/payment_method/:payment_method_id/delete', handle_async_errors(async (req, res) => {
        const twiml = new VoiceResponse();
        const payment_method = await req.c.payment_method_promise;
        
        const response = await shuttle_api.delete_payment_method(req.c, req.params.payment_method_id);
        
        twiml.say(`Deleted ${payment_method.name}`);
        twiml.say("Returning to main menu");
        twiml.redirect(app_path(req.c, `/main_menu`));

        res.type('text/xml');
        res.send(twiml.toString());        
    }));       

    app.all('/demo/:connector/:instance_id/:instance_secret/*', (req, res) => {
        res.status(404).send();
    });
}

exports.mount = mount;