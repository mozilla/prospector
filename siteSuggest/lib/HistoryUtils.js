/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const {Cc,Ci,Cu} = require("chrome");
Cu.import("resource://gre/modules/PlacesUtils.jsm", this);


/**
 * runs a query agaisnt places database
 *
 * @usage executeHistoryQuery( query , params , callbacks )
 * @param [string] query: what to execute
 * @param [object] params: names of the parameters
 * @return [object] callback: handlig row, completion, and error
 *
 * @example executeHistoryQuery( "select * from t" ,
 *                              myparams,
 *                              { onRow: handleRow( row ) ,
 *                                onCompletion: handleCompletion( reason ),
 *                                onErrro: handleError( error )
 *                              });
 *
 */

exports.executeHistoryQuery  = function execQuery( query , params , callbacks ) {
    let connection = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase).DBConnection;
    let statement = connection.createAsyncStatement(query);
    if (params) {

      for (let param in params) {
        console.log("MorePlacesUtils._getAsyncStatement: param: " + param + " = " + params[param]);
        statement.params[param] = params[param];
      }

    }
    statement.executeAsync({

        handleResult: function (result) {

          let rows = [];
          let row = null;
          while (row = result.getNextRow()) {
            if( callbacks.onRow ) {
              callbacks.onRow( row );
            }
          }  // eof while

        },

        handleCompletion: function (reason) {

          if( callbacks.onCompletion ) { callbacks.onCompletion( reason ); }

        },

        handleError: function (error) {

          if( callbacks.onError ) callbacks.onError( error );

        }

   });

} // end of execQuery
