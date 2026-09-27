/*
 * Synthetic corpus generator, evaluated INSIDE the page (it is passed to
 * page.evaluate as source text) so it can call the app's normaliseRecord().
 *
 * Produces N distinct base titles from a large token pool, then plants D
 * duplicates with the kinds of drift a real cross-database export shows:
 * half lose their DOI, a third are upper-cased, a third are repunctuated.
 * Each record carries truthId so precision and recall can be scored exactly.
 *
 * An earlier version of this generator built titles from a small vocabulary
 * with a numeric suffix, which produced genuine stem collisions and made the
 * deduplicator look imprecise. The token pool below keeps base titles distinct.
 */
'use strict';

module.exports = function corpusSource(n, planted, seed) {
  return `
  (function () {
    const heads = ['Adversarial robustness','Federated learning','Intrusion detection','Explainable artificial intelligence',
      'Zero trust architecture','Digital identity management','Anomaly detection','Edge computing offloading',
      'Threat intelligence sharing','Privacy preserving analytics','Graph neural networks','Side channel analysis',
      'Differential privacy','Blockchain consensus','Intrusion prevention','Malware classification','Access control policy',
      'Secure multiparty computation','Transfer learning','Reinforcement learning'];
    const mids = ['for industrial control systems','in vehicular networks','under distribution shift','for critical infrastructure',
      'in cloud native deployments','at the network edge','for healthcare records','in smart grid telemetry',
      'across federated hospitals','for encrypted traffic','in software defined networks','for satellite links'];
    const tails = ['a systematic evaluation','an empirical comparison','a measurement study','a design framework',
      'lessons from deployment','a scalability analysis','a reproducibility study','a taxonomy and roadmap'];
    const pool = ('lightweight hierarchical probabilistic contrastive variational spectral temporal causal sparse dense hybrid modular attentive recurrent convolutional ensemble bayesian kernel latent residual generative discriminative adaptive federated distributed asynchronous incremental online semantic syntactic topological metric geometric algebraic statistical heuristic evolutionary swarm quantised pruned distilled calibrated regularised augmented normalised embedded tokenised windowed gated masked pooled stacked cascaded fused aligned anchored clustered partitioned sharded replicated verified attested audited sandboxed isolated hardened obfuscated randomised shuffled permuted signature behavioural telemetry provenance lineage attestation entropy gradient manifold trajectory episode policy reward surrogate proxy oracle benchmark corpus lexicon ontology taxonomy schema pipeline scheduler allocator partitioner aggregator coordinator orchestrator arbiter monitor sentinel beacon relay gateway broker registry ledger enclave anchor witness checkpoint snapshot').split(/\\s+/);
    let s = ${seed};
    const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const p = a => a[Math.floor(r() * a.length)];
    const recs = []; const seen = new Set();
    for (let i = 0; i < ${n}; i++) {
      let t; do { t = p(heads) + ' ' + p(mids) + ' using ' + p(pool) + ' ' + p(pool) + ' ' + p(pool) + ' representations: ' + p(tails); } while (seen.has(t));
      seen.add(t);
      const rec = normaliseRecord({ title: t, year: String(2015 + Math.floor(r() * 11)),
        authors: 'Surname' + Math.floor(r() * 900) + ', A.; Other, B.',
        dbSource: ['Scopus', 'Web of Science', 'PubMed'][Math.floor(r() * 3)],
        doi: r() > 0.4 ? '10.1000/x' + i : '' });
      rec.truthId = 'T' + i; recs.push(rec);
    }
    for (let i = 0; i < ${planted}; i++) {
      const base = recs[Math.floor(r() * ${n})];
      const copy = normaliseRecord(Object.assign({}, base, { id: undefined }));
      copy.truthId = base.truthId; copy.dbSource = 'Web of Science';
      copy.doi = r() > 0.5 ? base.doi : '';
      const d = r();
      if (d > 0.66) copy.title = base.title.toUpperCase();
      else if (d > 0.33) copy.title = base.title.replace(/:/, ' -') + '.';
      copy._planted = true; recs.push(copy);
    }
    return recs;
  })()`;
};
