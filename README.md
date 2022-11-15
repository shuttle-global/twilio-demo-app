# Shuttle Twilio Demo App

This is a simple demo app to showcase payments in Twilio, it is not intended to be the blueprint for an actual app, but rather just a working demo. You will probably get the most value out of just reviewing the source code, but you can run it if you wish.


Prefer to watch a video? [click here](https://www.loom.com/share/5c1f10aa3d5a4e6fa933b4e3675533d2)

## To use

Set the following environment variables if you want to use payment links:

```
# Required for payment links

# A SID for your twilio account
export TWILIO_SID= 
# A token for your twilio account
export TWILIO_TOKEN= 
# A phone number on your account that can send SMS, defaults to the dialled phone
export TWILIO_SMS_FROM= 
```

```
npm install
npm start
```

Then to connect Twilio to the app, use ngrok (https://ngrok.com/):

```
ngrok config add-authtoken /* auth token */
ngrok http 3000
```

And set your Twilio phone number webhook endpoint to the demo app URL supplied on twilio.shuttleglobal.com, replacing `twilio.shuttleglobal.com` with the `your.ngrok.url`.


## Functionality

The app showcases some key use cases:

1. How to take a payment
2. How to do an authorisation
3. How to tokenise a card
4. How to take a payment AND tokenise the card

In each case, it provides the customer the choice to use:

1. A card (if you have installed a card processor)
2. ACH (if you have installed an ACH processor - excluding Authorisation which ACH does not support)
3. A saved card (if you have saved one previously on your phone number)
4. A payment link, ie send the user a SMS to complete payment on their phone browser

The app demonstrates how to use the `/capabilities` API to determine what's supported by the merchant, and how to generate the `<Pay>` link, request saved payment methods, instruct a payment on a saved payment method and create a payment link.

The app then shows how to retrieve payment, and depending on status take the appropriate next step, ie `status`:

* `SUCCESS` / `UNATTRIBUTED`: The success path
* `PENDING` / `UNRESOLVED`: The "in-progress" path
* `DECLINED` / `REQAUTH`: The failed path 

The app also shows how to determine if the transaction is refundable and how to instruct a refund, and also how to instruct a capture / void for authorisations.

## App Structure

We've tried to keep the code very simple to aid legibility.

* The `shuttle_api` object is a simple wrapper on some of [Shuttle's REST API](https://api.shuttleglobal.com/):

	- `get_instance`: The merchant details
	- `get_capabilities`: What's possible based on connected payment processor
	- `get_payment_methods`: List previously tokenised payment methods for the customer
	- `get_payment_method`: Get a specific payment method (ie after tokenisation)
	- `get_payment`: Get payment details
	- `create_payment`: Perform an API payment using a saved token
	- `create_checkout`: Create a checkout for use in a payment link 
	- `refund_payment`: Instruct a full or partial refund
	- `capture_payment`: Capture a full or partial authorisation
	- `void_payment`: Cancel an authorisation
	- `delete_payment_method`: Delete a saved token
	- `send_sms`: Twilio wrapper to send a payment link

* Express "middleware" (the `app.use`) extracts key data from each request:

	- `connector`: The Twilio Pay Connector ID
	- `instance_id`: Shuttle account `username` 
	- `instance_secret`: Shuttle account `password`
	- `account_phone`: The from phone number 
	- `account_crm_key`: A customer ID - for us we've based it on telephone number, however for you, you will have some kind of customer identification process
	- `payment_id`: For URL path's under a specific payment 
	- `payment_method_id`: For URL path's under a specific payment mathod (token) 

* `.../start`: The app entry point, if the user configured a GET in Twilio we redirect to a POST, so that we can see the caller's phone number and lookup if there are any saved cards. This uses:

	- `instance` to get the merchant name and if its a sandbox account
	- `capabilities` to confirm you've configured the account and its ready for payment.

* `.../main_menu`: A menu to allow the user to select a test case, see the `build_main_menu` function and specifically the `enabled` fields which showcases how to know if a feature is available. This uses:

	- `capabilities` API to see which specific functions are available
	- `get_payment_methods` API to see if there are any cards stored on the account

* `.../new_payment`: This function creates the TwiML for all `<Pay>` verb use cases (payment, authorisation, tokenisation, card, ACH) 
* `.../payment_response`: This function gets the callback from the Pay Connector, inspects the response and decides the next step
* `.../repeat_payment`: This function performs a payment on a saved token using the Shuttle API.
* `.../payment_link`: This function creates a "checkout" and sends an SMS to the customer to complete payment online
* `.../payment_link/:link/wait`: This function waits for a payment link to complete
* `.../payment/:id`: This function gets the payment, and inspects the status to determine the next step (Success -> Payment Menu, In Progress -> Main Menu, Decline -> Main Menu)
* `.../payment/:id/payment_menu`: This function presents options for subsequent actions on a payment (refund, capture, void). This uses:

	- `capabilities` API to determine what is supported
	- `payment` to determine if it has been refunded / captured

* `.../payment/:id/payment_menu_response`: This function instructs the selected action from the payment menu. This uses:

	- `refund_payment` to instruct a refund
	- `capture_payment` to instruct a capture, this then goes back to the menu to allow refund
	- `void_payment` to instruct a void

* `.../payment_method/:id`: This function advises if tokenisation was successful and returns to main menu. This uses:

	- `payment_method` 

* `.../payment_method/:id/delete`: This function deletes a token. This uses:

	- `delete_payment_method` 


