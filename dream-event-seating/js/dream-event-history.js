/** Small bounded in-memory undo/redo history. */
(function (root) {
  'use strict';
  function History(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }
  History.prototype.push = function (value) {
    this.undoStack.push(JSON.stringify(value));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  };
  History.prototype.undo = function (current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(JSON.stringify(current));
    return JSON.parse(this.undoStack.pop());
  };
  History.prototype.redo = function (current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(JSON.stringify(current));
    return JSON.parse(this.redoStack.pop());
  };
  root.DreamEventHistory = History;
})(window);
