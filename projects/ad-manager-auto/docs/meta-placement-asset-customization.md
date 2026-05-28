# Meta placement asset customization notes

Last verified: 2026-05-28.

Working goal: launch one Meta ad in one ad set with separate 1:1 and 9:16 image assets assigned to placements.

Confirmed working result:

- One Meta ad was created: `120249853429330285`.
- One Meta ad creative was created: `2658355997899580`.
- The local `feed` and `stories_reels` creative rows both stored the same `facebook_ad_id`.
- Meta returned previews for desktop feed, mobile feed, Instagram feed, Instagram story, Facebook story, Facebook reels, Instagram reels, and right column.

Required payload details:

- Use `asset_feed_spec.optimization_type = "PLACEMENT"`.
- Put all placement-specific images in `asset_feed_spec.images`.
- Add `adlabels` to each image, for example `asset_feed` and `asset_stories_reels`.
- Use `asset_customization_rules` with `image_label` pointing at those labels.
- Add explicit rules for secondary placement buckets that Ads Manager displays separately, such as Facebook search/right column, Instagram explore/search/profile feed, Messenger home/story, and Audience Network apps/sites. Relying only on the empty default rule can leave blank rows or warnings in the Ads Manager media editor even when API previews work.
- Use `object_story_spec.instagram_user_id`, not `instagram_actor_id`, on Graph API v25.
- The default/fallback asset rule must use `customization_spec: {}`. Do not use `is_default: true`; Meta returned code `100`, subcode `1487390` for that shape.
- Keep placement groups in one ad creative. Do not fall back to creating separate ads unless the product decision changes.

Minimal working rule shape:

```json
[
  {
    "customization_spec": {
      "publisher_platforms": ["facebook", "instagram"],
      "facebook_positions": ["feed"],
      "instagram_positions": ["stream"]
    },
    "image_label": { "name": "asset_feed" }
  },
  {
    "customization_spec": {
      "publisher_platforms": ["facebook", "instagram"],
      "facebook_positions": ["story", "facebook_reels"],
      "instagram_positions": ["story", "reels"]
    },
    "image_label": { "name": "asset_stories_reels" }
  },
  {
    "customization_spec": {},
    "image_label": { "name": "asset_feed" }
  }
]
```

Expanded rule shape for cleaner Ads Manager placement rows:

```json
[
  {
    "customization_spec": {
      "publisher_platforms": ["facebook"],
      "facebook_positions": ["feed", "video_feeds", "instream_video", "marketplace", "search", "right_hand_column"]
    },
    "image_label": { "name": "asset_feed" }
  },
  {
    "customization_spec": {
      "publisher_platforms": ["instagram"],
      "instagram_positions": ["stream", "explore", "explore_home", "profile_feed", "ig_search"]
    },
    "image_label": { "name": "asset_feed" }
  },
  {
    "customization_spec": {
      "publisher_platforms": ["facebook"],
      "facebook_positions": ["story", "facebook_reels"]
    },
    "image_label": { "name": "asset_stories_reels" }
  },
  {
    "customization_spec": {
      "publisher_platforms": ["instagram"],
      "instagram_positions": ["story", "reels"]
    },
    "image_label": { "name": "asset_stories_reels" }
  },
  {
    "customization_spec": {
      "publisher_platforms": ["audience_network"],
      "audience_network_positions": ["classic", "rewarded_video"]
    },
    "image_label": { "name": "asset_stories_reels" }
  },
  {
    "customization_spec": {
      "publisher_platforms": ["messenger"],
      "messenger_positions": ["messenger_home", "story"]
    },
    "image_label": { "name": "asset_stories_reels" }
  },
  {
    "customization_spec": {},
    "image_label": { "name": "asset_feed" }
  }
]
```

Debug notes from the fix:

- Missing `optimization_type: "PLACEMENT"` caused Meta creative creation failures.
- `instagram_actor_id` caused `Param instagram_actor_id must be a valid Instagram account id`.
- `instagram_user_id` with the same Instagram account id was accepted.
- `is_default: true` in the default asset rule caused generic `code 100`, subcode `1487390`.
- Changing that default rule to `customization_spec: {}` passed `execution_options: ["validate_only"]` and then launched successfully.
