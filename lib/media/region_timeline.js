/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.RegionTimeline');

goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * The region timeline is a set of unique timeline region info entries. When
 * a new entry is added, the 'regionadd' event will be fired.  When an entry is
 * deleted, the 'regionremove' event will be fired.
 *
 * @implements {shaka.util.IReleasable}
 * @template T
 * @final
 */
shaka.media.RegionTimeline = class extends shaka.util.FakeEventTarget {
  /**
   * @param {!function():{start: number, end: number}} getSeekRange
   */
  constructor(getSeekRange) {
    super();

    /** @private {!Set<T>} */
    this.regions_ = new Set();

    /** @private {!function():{start: number, end: number}} */
    this.getSeekRange_ = getSeekRange;

    /**
     * Make sure all of the regions we're tracking are within the
     * seek range or further in the future. We don't want to store
     * regions that fall before the start of the seek range.
     *
     * @private {shaka.util.Timer}
     */
    this.filterTimer_ = new shaka.util.Timer(() => {
      this.filterBySeekRange_();
    }).tickEvery(
        /* seconds= */ shaka.media.RegionTimeline.REGION_FILTER_INTERVAL);
  }

  /** @override */
  release() {
    this.regions_.clear();
    this.filterTimer_.stop();
    super.release();
  }

  /**
   * @param {T} region
   */
  addRegion(region) {
    const similarRegion = this.findSimilarRegion_(region);

    // Make sure we don't add duplicate regions. We keep track of this here
    // instead of making the parser track it.
    if (similarRegion == null) {
      this.regions_.add(region);
      const event = new shaka.util.FakeEvent('regionadd', new Map([
        ['region', region],
      ]));
      this.dispatchEvent(event);
    }
  }

  /**
   * @private
   */
  filterBySeekRange_() {
    const seekRange = this.getSeekRange_();
    for (const region of this.regions_) {
      // Only consider the seek range start here.
      // Future regions might become relevant eventually,
      // but regions that are in the past and can't ever be
      // seeked to will never come up again, and there's no
      // reason to store or process them.
      if (region.endTime < seekRange.start) {
        this.regions_.delete(region);
        const event = new shaka.util.FakeEvent('regionremove', new Map([
          ['region', region],
        ]));
        this.dispatchEvent(event);
      }
    }
  }

  /**
   * Find a region in the timeline that has the same scheme id uri, event id,
   * start time and end time. If these four parameters match, we assume it
   * to be the same region. If no similar region can be found, |null| will be
   * returned.
   *
   * @param {T} region
   * @return {?T}
   * @private
   */
  findSimilarRegion_(region) {
    const isDiffNegligible = (a, b) => Math.abs(a - b) < 0.1;
    for (const existing of this.regions_) {
      // The same scheme ID and time range means that it is similar-enough to
      // be the same region.
      const isSimilar = existing.schemeIdUri == region.schemeIdUri &&
          existing.id == region.id &&
          isDiffNegligible(existing.startTime, region.startTime) &&
          isDiffNegligible(existing.endTime, region.endTime);

      if (isSimilar) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Get an iterable for all the regions in the timeline. This will allow
   * others to see what regions are in the timeline while not being able to
   * change the collection.
   *
   * @return {!Iterable<T>}
   */
  regions() {
    return this.regions_;
  }
};

/** @const {number} */
shaka.media.RegionTimeline.REGION_FILTER_INTERVAL = 2; // in seconds
