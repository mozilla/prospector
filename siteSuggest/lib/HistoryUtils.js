/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Initial Developer of the Original Code is the Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011 the
 * Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Max Zhilyaev <max@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

'use strict';

const {Cc,Ci,Cm,Cr,Cu,components} = require("chrome");
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
