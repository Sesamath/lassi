/**
 * Description de la classe
 * @Abracadabra toto tutut titi
 */
__Class('packageA.packageB.ClasseC', {
  extend: packageA.packageB.ClasseB,

  construct: function(value) {
    this._value = value;
  },

  /**
   * Une méthode
   * @Test
   */
  value: function() {
    return this._value;
  },

  sum: function() {
    return this.parent()+1;
  },

  /**
   * Une méthode
   * @static
   */
  staticHerite: function() {
    return 'static-hérité';
  },
  /**
   * Une méthode
   * @static
   */
  staticEcrase: function() {
    return 'static-pas-ecrasé';
  },
  /**
   * Une méthode
   * @static
   */
  ID: 'ID'
});


