/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function ItemJar( limit  ) {
    this.limit = limit;
    this.length = 0;
	this.items = [];
}

ItemJar.prototype = {

  moveUp: function ( ) {

  	let index = this.length - 1;
	//console.log( "INDEX " + index );
	while( index >  0 && this.items[index].weight > this.items[index-1].weight ) {
	    //console.log( "swapping ", index , index - 1 );
		let prev = this.items[index-1];
		this.items[index-1] = this.items[index];
		this.items[index] = prev;
		index--;
	}

  },

  addItem: function ( item , weight ) {
  	 
  	 if( this.length == this.limit ) {
     	let last = this.items[ this.length - 1 ];
		if( last.weight >= weight ) return;
		last = { item: item , weight: weight };
		this.items[ this.length - 1] = last;
	 } else {
		this.items[ this.length ] = { item: item , weight: weight };
		this.length++;
	 }

	 this.moveUp( );
	 //console.log( JSON.stringify( this.items ) );
  },

  getItems: function( ) {
  	return this.items;
  }

}


exports.ItemJar = ItemJar;


