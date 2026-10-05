// @ts-check
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) /** @type {any} */ (root).TruePathConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Adapt the one approved JSON configuration to the existing scoring/report contracts. */
  function build(c) {
    const talents = c.T, roles = c.R, view = c.presentation;
    const archetypes = Object.entries(c.ARCH).map(([pair, value]) => ({
      key: pair.replace('+', '_'), pair: pair.split('+'), name: value[0], essence: value[1]
    }));
    const scoring = {
      version:'2.1', affinityMatrixVersion:c.affinityMatrixVersion, ikigaiTagVersion:c.ikigaiTagVersion,
      weights:c.W, pointsPerScenario:c.pointsPerScenario, scenarioCount:c.SC.length,
      dualThreshold:c.TH.dual, balancedThreshold:c.TH.balanced, talent:c.talentScoring,
      affinity:c.AFFINITY, ikigaiRoleTags:c.TAGS
    };
    const talent = {
      ...view.talent, version:'2.1', fixedOrder:talents,
      categories:talents.map(key => ({key,name:c.TN[key],character:'才',coreStrengths:c.TS[key]})),
      questions:c.Q.map((item,i) => ({id:'Q'+(i+1),category:talents[Math.floor(i/3)],text:item[0]})),
      displayOrder:c.ORDER.map(i=>'Q'+(i+1)), archetypes, scoring:scoring.talent
    };
    const fields = ['energises','goodAt','economicValue','impact'];
    const rows = ['Energises','Good at','Work you could be paid for','Impact'];
    const ikigai = {
      ...view.ikigai, version:'2.1',
      screens:c.IK.map((item,i) => ({id:'I-'+(i+1),field:fields[i],rowLabel:rows[i],question:item[0],helper:item[2]&&typeof item[2]==='string'?item[2]:null,
        options:item[1].map(option=>({key:option[0],label:option[1],role:c.TAGS[option[0]]||null,rephrase:option[2]}))})),
      suggestions:Object.fromEntries(talents.map(key=>[key,Object.fromEntries(c.SG[key].map((values,i)=>['I-'+(i+1),values]))])),
      talentSkills:c.CAP,
      roleEnvironment:Object.fromEntries(roles.map(role=>[role,c.IK[2][1].filter(option=>c.TAGS[option[0]]===role).map(option=>option[0])]))
    };
    const ironTriangle = {
      ...view.ironTriangle, version:'2.1',
      roles:roles.map(key=>({...view.ironTriangle.roleContext[key],key,name:c.RN[key][0],chinese:c.RN[key][1],subtitle:c.RN[key][2],glyph:c.RN[key][3],
        coreLine:c.RC[key].core,naturalStrengths:c.RC[key].str.split(' · '),contribution:c.RC[key].contrib,
        watchOut:c.RC[key].watch,allies:c.RC[key].ally,thrive:c.RC[key].thrive,growthEdge:c.RC[key].edge})),
      scenarios:c.SC.map((item,i)=>({id:'S'+(i+1),prompt:item[0],options:Object.fromEntries(roles.map((role,j)=>[role,item[j+1]]))})),
      gapInsights:Object.fromEntries(roles.map(role=>[role,{classicImbalance:view.ironTriangle.gapContext[role],insight:c.GAP[role]}])),
      patterns:{balanced:view.ironTriangle.balanced,dual:Object.fromEntries(Object.entries(c.DL).map(([pair,value])=>[pair.replace('+','_'),{label:value[0],line:value[1]}]))}
    };
    const truthPath = {
      ...view.truthPath, version:'2.1',
      titles:archetypes.flatMap(archetype=>roles.map((role,i)=>({key:archetype.key+'__'+role,archetype:archetype.key,
        role,title:c.TI[archetype.name][i][0],essence:c.TI[archetype.name][i][1]}))),
      talentVerbs:c.TV, roleVerbs:c.RV, reflectionPrompts:c.REFL,
      alignmentMessages:{...c.AMSG,talent_capability_divergent:c.AMSG.talent_capability_explore,economic_gap_role:c.AMSG.economic_role_explore}
    };
    const cta = {...view.cta,
      result:{...view.cta.result,consultHref:c.integration.consultUrl,products:c.integration.products},
      report:{...view.cta.report,privacyHref:c.integration.privacyUrl},
      bookingUrl:c.integration.bookingUrl||''};
    // v2.3: shared display bands and page-4 copy, kept in config so no renderer duplicates them.
    const strengthBands = c.STRENGTH_BANDS || [];
    const strengthLabel = function (pct) {
      const v = Math.max(0, Math.min(100, Number(pct) || 0));
      const band = strengthBands.find(function (b) { return v >= b.min; });
      return band ? band.label : 'Emerging';
    };
    return {talent,ikigai,ironTriangle,scoring,truthPath,trupath:truthPath,cta,canonical:c,
      strengthBands, strengthLabel,
      energyLines:c.ENERGY_LINES||{}, essenceSentences:c.ESSENCE_SENTENCES||{},
      watchouts:c.WATCHOUTS||null,
      advisoryUrl:(c.integration&&c.integration.advisoryUrl)||''};
  }
  return Object.freeze({build});
});
