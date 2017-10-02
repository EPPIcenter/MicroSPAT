from sqlalchemy.orm import attributes
from sqlalchemy.orm.base import object_state

def params_changed(target, params):
    state = object_state(target)

    if not state.modified:
        return False

    dict_ = state.dict

    for attr in state.manager.attributes:
        if not hasattr(attr.impl, 'get_history') or hasattr(attr.impl, 'get_collection') or attr.key not in params:
            continue
        (added, unchanged, deleted) = attr.impl.get_history(state, dict_, passive=attributes.NO_CHANGE)
        if added or deleted:
            return True
    else:
        return False
