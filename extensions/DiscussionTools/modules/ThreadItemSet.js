var CommentItem = require( './CommentItem.js' );
var HeadingItem = require( './HeadingItem.js' );
var ThreadItem = require( './ThreadItem.js' );

/**
 * Groups thread items (headings and comments) generated by parsing a discussion page.
 *
 * @class ThreadItemSet
 */
function ThreadItemSet() {
	this.threadItems = [];
	this.commentItems = [];
	this.threadItemsByName = {};
	this.threadItemsById = {};
	this.threads = [];
}

OO.initClass( ThreadItemSet );

/**
 * Created a ThreadItemSet from DOM nodes that have been annotated by the PHP CommentFormatter with
 * metadata about the thread structure.
 *
 * @param {HTMLElement[]} nodes
 * @param {HTMLElement} rootNode
 * @param {mw.dt.Parser} parser
 * @return {ThreadItemSet}
 */
ThreadItemSet.static.newFromAnnotatedNodes = function ( nodes, rootNode, parser ) {
	var result = new ThreadItemSet();

	// The page can be served from the HTTP cache (Varnish), containing data-mw-comment generated
	// by an older version of our PHP code. Code below must be able to handle that.
	// See CommentFormatter::addDiscussionTools() in PHP.

	var i, item;

	var items = [];
	var replyIds = [];
	var itemsById = {};

	// Create ThreadItem objects with basic data
	for ( i = 0; i < nodes.length; i++ ) {
		var hash = JSON.parse( nodes[ i ].getAttribute( 'data-mw-comment' ) );
		item = ThreadItem.static.newFromJSON( hash, rootNode );
		result.addThreadItem( item );

		// Store info for second pass
		items[ i ] = item;
		replyIds[ i ] = hash.replies;
		itemsById[ item.id ] = item;
	}

	// Now that we have all objects, we can set up replies/parent pointers
	for ( i = 0; i < nodes.length; i++ ) {
		item = items[ i ];

		// eslint-disable-next-line no-loop-func
		item.replies = replyIds[ i ].map( function ( id ) {
			itemsById[ id ].parent = item;
			return itemsById[ id ];
		} );

		// Calculate names (currently not stored in the metadata)
		item.name = parser.computeName( item );

		result.updateIdAndNameMaps( item );
	}

	return result;
};

/**
 * @param {ThreadItem} item
 */
ThreadItemSet.prototype.addThreadItem = function ( item ) {
	this.threadItems.push( item );
	if ( item instanceof CommentItem ) {
		this.commentItems.push( item );
	}
	if ( item instanceof HeadingItem ) {
		this.threads.push( item );
	}
};

/**
 * @return {boolean}
 */
ThreadItemSet.prototype.isEmpty = function () {
	return this.threadItems.length === 0;
};

/**
 * @param {ThreadItem} item
 */
ThreadItemSet.prototype.updateIdAndNameMaps = function ( item ) {
	if ( !this.threadItemsByName[ item.name ] ) {
		this.threadItemsByName[ item.name ] = [];
	}
	this.threadItemsByName[ item.name ].push( item );

	this.threadItemsById[ item.id ] = item;
};

/**
 * Get all discussion comments (and headings) within a DOM subtree.
 *
 * This returns a flat list, use #getThreads to get a tree structure starting at section headings.
 *
 * For example, for a MediaWiki discussion like this (we're dealing with HTML DOM here, the wikitext
 * syntax is just for illustration):
 *
 *     == A ==
 *     B. ~~~~
 *     : C.
 *     : C. ~~~~
 *     :: D. ~~~~
 *     ::: E. ~~~~
 *     ::: F. ~~~~
 *     : G. ~~~~
 *     H. ~~~~
 *     : I. ~~~~
 *
 * This function would return a structure like:
 *
 *     [
 *       HeadingItem( { level: 0, range: (h2: A)        } ),
 *       CommentItem( { level: 1, range: (p: B)         } ),
 *       CommentItem( { level: 2, range: (li: C, li: C) } ),
 *       CommentItem( { level: 3, range: (li: D)        } ),
 *       CommentItem( { level: 4, range: (li: E)        } ),
 *       CommentItem( { level: 4, range: (li: F)        } ),
 *       CommentItem( { level: 2, range: (li: G)        } ),
 *       CommentItem( { level: 1, range: (p: H)         } ),
 *       CommentItem( { level: 2, range: (li: I)        } )
 *     ]
 *
 * @return {ThreadItem[]} Thread items
 */
ThreadItemSet.prototype.getThreadItems = function () {
	return this.threadItems;
};

/**
 * Same as getFlatThreadItems, but only returns the CommentItems
 *
 * @return {CommentItem[]} Comment items
 */
ThreadItemSet.prototype.getCommentItems = function () {
	return this.commentItems;
};

/**
 * Find ThreadItems by their name
 *
 * This will usually return a single-element array, but it may return multiple comments if they're
 * indistinguishable by name. In that case, use their IDs to disambiguate.
 *
 * @param {string} name Name
 * @return {ThreadItem[]} Thread items, empty array if not found
 */
ThreadItemSet.prototype.findCommentsByName = function ( name ) {
	return this.threadItemsByName[ name ] || [];
};

/**
 * Find a ThreadItem by its ID
 *
 * @param {string} id ID
 * @return {ThreadItem|null} Thread item, null if not found
 */
ThreadItemSet.prototype.findCommentById = function ( id ) {
	return this.threadItemsById[ id ] || null;
};

/**
 * Group discussion comments into threads and associate replies to original messages.
 *
 * Each thread must begin with a heading. Original messages in the thread are treated as replies to
 * its heading. Other replies are associated based on the order and indentation level.
 *
 * Note that the objects in `comments` are extended in-place with the additional data.
 *
 * For example, for a MediaWiki discussion like this (we're dealing with HTML DOM here, the wikitext
 * syntax is just for illustration):
 *
 *     == A ==
 *     B. ~~~~
 *     : C.
 *     : C. ~~~~
 *     :: D. ~~~~
 *     ::: E. ~~~~
 *     ::: F. ~~~~
 *     : G. ~~~~
 *     H. ~~~~
 *     : I. ~~~~
 *
 * This function would return a structure like:
 *
 *     [
 *       HeadingItem( { level: 0, range: (h2: A), replies: [
 *         CommentItem( { level: 1, range: (p: B), replies: [
 *           CommentItem( { level: 2, range: (li: C, li: C), replies: [
 *             CommentItem( { level: 3, range: (li: D), replies: [
 *               CommentItem( { level: 4, range: (li: E), replies: [] } ),
 *               CommentItem( { level: 4, range: (li: F), replies: [] } ),
 *             ] } ),
 *           ] } ),
 *           CommentItem( { level: 2, range: (li: G), replies: [] } ),
 *         ] } ),
 *         CommentItem( { level: 1, range: (p: H), replies: [
 *           CommentItem( { level: 2, range: (li: I), replies: [] } ),
 *         ] } ),
 *       ] } )
 *     ]
 *
 * @return {HeadingItem[]} Tree structure of comments, top-level items are the headings.
 */
ThreadItemSet.prototype.getThreads = function () {
	return this.threads;
};

module.exports = ThreadItemSet;
