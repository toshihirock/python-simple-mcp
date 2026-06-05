"""
AgentCore Gateway Lambda handler.

AgentCore Gateway invokes this Lambda with:
- event: A map of properties from the inputSchema to their values
- context.client_context.custom: Metadata including bedrockAgentCoreToolName

The tool name in context includes a target prefix: {target_name}___{tool_name}
"""


def lambda_handler(event, context):
    # Extract tool name from context (strip target prefix)
    delimiter = "___"
    original_tool_name = context.client_context.custom["bedrockAgentCoreToolName"]
    tool_name = original_tool_name[original_tool_name.index(delimiter) + len(delimiter):]

    if tool_name == "add_numbers":
        a = event.get("a", 0)
        b = event.get("b", 0)
        result = a + b
        return {"result": result}

    elif tool_name == "multiply_numbers":
        a = event.get("a", 0)
        b = event.get("b", 0)
        result = a * b
        return {"result": result}

    elif tool_name == "greet_user":
        name = event.get("name", "World")
        return {"message": f"Hello, {name}! Nice to meet you."}

    else:
        return {"error": f"Unknown tool: {tool_name}"}
