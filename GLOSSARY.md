# Better Journal

A personal journaling app: a user keeps journals of notes, files them under days on a calendar, tags them, searches them, and can share a note by link.

## Language

### Journals and notes

**Journal**:
A named collection of notes owned by exactly one user.
_Avoid_: notebook, diary

**Note**:
A single dated entry in a journal, with a title, rich-text content and tags. A note has no trash of its own; deleting a note is permanent.
_Avoid_: entry, post, page

**Note content**:
The rich-text document of a note, limited to the node and mark types the note document schema allows.
_Avoid_: body, value, Plate value

**Share link**:
An unlisted, read-only URL that lets anyone holding it read one note of a live journal without signing in. A note has at most one share link; revoking it ends access immediately.
_Avoid_: public link, published note

**Live journal**:
A journal that is not in the trash. Only live journals and their notes can be read, edited, searched or reached through a share link.
_Avoid_: active journal

**Trashed journal**:
A journal its owner has moved to the trash. It and its notes are hidden everywhere except the trash, and it can be restored to a live journal or purged.
_Avoid_: deleted journal, archived journal

**Purge**:
Permanently deleting a trashed journal and all its notes. Only a trashed journal can be purged.
_Avoid_: hard delete, delete permanently

### Time

**Reader zone**:
The IANA timezone of the person currently looking at the journal. It decides which day every note belongs to for that reader.
_Avoid_: client timezone, browser timezone, user timezone, tz

**Reader's calendar day**:
A calendar day (`yyyy-MM-dd`) as lived in the reader zone. A note belongs to the reader's calendar day on which its creation instant falls, so the same note can sit on different days for readers in different zones.
_Avoid_: UTC day, server day, local date
