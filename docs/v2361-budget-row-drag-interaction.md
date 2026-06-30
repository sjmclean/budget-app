# v2.36.1 Budget Row Drag Interaction

## Summary

Improves the Budget screen drag interaction by making the category name area and category group name area draggable, instead of requiring the small grabber target.

## Behaviour

- Existing reorder logic is unchanged.
- Category rows can be dragged from the category/name cell.
- Category groups can be dragged from the group name.
- The grabber remains as a visual affordance only.
- Native drag now uses a whole-row/header drag image so the item being moved feels like the full row, not only a small handle.

## Notes

This remains an HTML5 drag-and-drop implementation. A future deeper drag modernisation may replace this with a pointer-based drag system if stronger sibling-row animation is required.
