__Class('packageA.packageB.ClasseD', {
  extend: packageA.packageB.ClasseC,
  construct: function(value) {
    this.parent('_'+value+'_');
  },

  /**
   * Une méthode
   * @static
   */
  staticEcrase: function() {
    return 'static-écrasé';
  },
});


