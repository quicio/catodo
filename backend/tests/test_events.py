"""Test EventBroker pub/sub and shutdown."""
import asyncio

import pytest

from catodo.events import EventBroker


@pytest.mark.asyncio
async def test_publish_reaches_subscribers():
    """Published events reach active subscribers."""
    broker = EventBroker()
    results = []

    async def _collect():
        async for evt in broker.subscribe():
            results.append(evt)

    task = asyncio.create_task(_collect())
    await asyncio.sleep(0)
    await broker.publish({"event": "test", "val": 42})
    await asyncio.sleep(0.1)
    await broker.close()
    await task
    assert len(results) == 1
    assert results[0]["val"] == 42


@pytest.mark.asyncio
async def test_close_does_not_raise():
    """Close on an empty broker does not raise."""
    broker = EventBroker()
    await broker.close()


@pytest.mark.asyncio
async def test_no_control_frame_leaks():
    """Subscribers never receive the sentinel as a domain event."""
    broker = EventBroker()
    events = []

    async def _collect():
        async for evt in broker.subscribe():
            events.append(evt.get("event"))

    task = asyncio.create_task(_collect())
    await asyncio.sleep(0)
    await broker.close()
    await asyncio.wait_for(task, timeout=2)
    assert "_closed" not in events
    assert all(e is not None for e in events)
